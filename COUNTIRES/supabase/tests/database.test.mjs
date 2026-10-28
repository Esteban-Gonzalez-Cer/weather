import assert from 'node:assert/strict'
import { before, after, beforeEach, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { PGlite } = require('@electric-sql/pglite')
const db = new PGlite()
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='

before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values ('${A}'),('${B}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`)
  await db.exec(await readFile(new URL('../migrations/001_countries.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../migrations/002_safe_catalog_publication.sql', import.meta.url), 'utf8'))
})
after(() => db.close())
beforeEach(async () => {
  await db.exec(`delete from public.countries; delete from public.ingestion_jobs;
    update public.catalog_state set last_success_at=null,country_count=0,status='idle',last_error=null;`)
})

async function as(role, user, query, params = []) {
  await db.exec('begin')
  try {
    await db.exec(`set local role ${role}`)
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user || ''])
    const result = await db.query(query, params)
    await db.exec('commit')
    return result.rows
  } catch (error) { await db.exec('rollback'); throw error }
}
async function rpc(role, user, name, args = [], placeholders) {
  const slots = placeholders || args.map((_, i) => `$${i+1}`).join(',')
  const rows = await as(role,user,`select public.${name}(${slots}) as value`,args)
  return rows[0].value
}
async function claim(user = A) {
  await rpc('authenticated',user,'request_catalog_refresh')
  return rpc('service_role',null,'claim_catalog_job')
}
function snapshot() {
  return Array.from({ length: 200 }, (_, i) => {
    const a = String.fromCharCode(65 + Math.floor(i/26)), b = String.fromCharCode(65+i%26)
    const name = i === 0 ? 'México' : i === 1 ? 'España' : `País ${String(i).padStart(3,'0')}`
    return { code: `X${a}${b}`, alpha2: a+b, name: i === 0 ? 'Mexico' : name,
      official_name: name, spanish_name: name, native_names: {}, region: i % 2 ? 'Europe' : 'Americas',
      subregion: null, capitals: i ? [] : ['Ciudad de México'], population: i === 2 ? null : 1000+i,
      area_km2: i, languages: [], currencies: [], timezones: [], borders: [], continents: [],
      calling_codes: [], tlds: [], latitude: null, longitude: null, independent: null, un_member: null,
      flag_png_base64: png, search_text: `${name.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()} ${a}${b}`.toLowerCase() }
  })
}
async function publish(job, records = snapshot()) {
  return rpc('service_role',null,'publish_countries',[job.id,job.attempts,JSON.stringify(records),records.length], '$1::uuid,$2::integer,$3::jsonb,$4::integer')
}

test('unauthenticated users cannot read the catalog or submit jobs',async () => {
  await assert.rejects(as('anon',null,'select * from countries'),/permission denied/i)
  await assert.rejects(rpc('anon',null,'get_countries'),/permission denied/i)
  await assert.rejects(rpc('anon',null,'request_catalog_refresh'),/permission denied/i)
})
test('authenticated users can queue but cannot publish or edit data',async () => {
  const response = await rpc('authenticated',A,'request_catalog_refresh')
  assert.equal(response.status,'queued')
  await assert.rejects(as('authenticated',A,"update countries set name='tampered'"),/permission denied/i)
  await assert.rejects(rpc('authenticated',A,'claim_catalog_job'),/permission denied/i)
  await assert.rejects(rpc('authenticated',A,'publish_countries',[response.job_id,1,'[]',200], '$1::uuid,$2::integer,$3::jsonb,$4::integer'),/permission denied/i)
})
test('jobs are private; concurrent requests reuse one job without revealing another user ID',async () => {
  const first = await rpc('authenticated',A,'request_catalog_refresh')
  const own = await rpc('authenticated',A,'request_catalog_refresh')
  const other = await rpc('authenticated',B,'request_catalog_refresh')
  assert.equal(own.job_id,first.job_id)
  assert.equal(other.job_id,null)
  assert.equal(other.status,'queued')
  assert.equal((await as('authenticated',B,'select * from ingestion_jobs')).length,0)
  assert.equal((await as('authenticated',A,'select * from ingestion_jobs')).length,1)
})
test('a full publication stores flags and supports accented search, region filters and pagination',async () => {
  assert.equal(await publish(await claim()),200)
  const found = await rpc('authenticated',B,'get_countries',['  MÉXICO  ','','name',1,12])
  assert.equal(found.total,1)
  assert.equal(found.items[0].spanish_name,'México')
  assert.equal(found.items[0].flag_png_base64,png)
  const europe = await rpc('authenticated',A,'get_countries',['','Europe','population',1,12])
  assert.equal(europe.total,100)
  assert.equal(europe.items.length,12)
  assert.ok(europe.items[0].population > europe.items[1].population)
  const page2 = await rpc('authenticated',A,'get_countries',['','Europe','population',2,12])
  assert.ok(!page2.items.some(v => europe.items.some(p => p.code === v.code)))
  const status = await rpc('authenticated',B,'get_catalog_status')
  assert.equal(status.total,200)
  assert.equal(status.stale,false)
  assert.equal(status.regions.length,2)
})
test('search treats SQL wildcards and injection strings as literal text',async () => {
  await publish(await claim())
  for (const query of ['%', '_', "'; delete from countries; --"]) {
    assert.equal((await rpc('authenticated',A,'get_countries',[query])).total,0)
  }
  assert.equal((await rpc('authenticated',A,'get_catalog_status')).total,200)
})
test('a failed transaction preserves the previous catalog and freshness',async () => {
  await publish(await claim())
  const initial = await rpc('authenticated',A,'get_catalog_status')
  await db.exec("update catalog_state set last_success_at=now()-interval '3 days'")
  const before = await rpc('authenticated',A,'get_catalog_status')
  const job = await claim(B)
  const broken = snapshot(); broken[0].name='DO NOT PUBLISH'; broken.at(-1).flag_png_base64='invalid'
  await assert.rejects(publish(job,broken),/check constraint/i)
  assert.equal((await as('authenticated',A,"select name from countries where code='XAA'"))[0].name,'Mexico')
  const state = await rpc('authenticated',A,'get_catalog_status')
  assert.equal(state.last_success_at,before.last_success_at)
  assert.equal(state.total,initial.total)
})
test('repeated refreshes replace snapshots without duplicates; fresh data avoids API work',async () => {
  await publish(await claim())
  assert.equal((await rpc('authenticated',B,'request_catalog_refresh')).status,'fresh')
  await db.exec("update catalog_state set last_success_at=now()-interval '2 days'")
  const job = await claim(B)
  const changed = snapshot(); changed[0].population=0
  await publish(job,changed)
  assert.equal((await as('authenticated',A,'select count(*)::integer as n from countries'))[0].n,200)
  assert.equal((await as('authenticated',A,"select population from countries where code='XAA'"))[0].population,0)
})
test('incomplete and null snapshots are rejected before publication',async () => {
  const job = await claim()
  await assert.rejects(publish(job,snapshot().slice(0,5)),/incompleto/i)
  await assert.rejects(rpc('service_role',null,'publish_countries',[job.id,1,null,200], '$1::uuid,$2::integer,$3::jsonb,$4::integer'),/incompleto/i)
  assert.equal((await rpc('authenticated',A,'get_catalog_status')).total,0)
})
test('lease recovery fences an interrupted worker and caps attempts',async () => {
  const first = await claim()
  await db.exec("update ingestion_jobs set claimed_at=now()-interval '11 minutes'")
  const second = await rpc('service_role',null,'claim_catalog_job')
  assert.equal(second.id,first.id)
  assert.equal(second.attempts,2)
  await assert.rejects(publish(first),/pertenece/i)
  assert.equal(await rpc('service_role',null,'fail_catalog_job',[first.id,1,'old worker',false], '$1::uuid,$2::integer,$3::text,$4::boolean'),false)
  await db.exec("update ingestion_jobs set claimed_at=now()-interval '11 minutes',attempts=3")
  assert.equal(await rpc('service_role',null,'claim_catalog_job'),null)
  assert.equal((await rpc('authenticated',A,'get_catalog_status')).status,'failed')
})
test('temporary failures retry and permanent errors preserve a readable catalog',async () => {
  const first = await claim()
  await rpc('service_role',null,'fail_catalog_job',[first.id,1,'Proveedor ocupado',true], '$1::uuid,$2::integer,$3::text,$4::boolean')
  assert.equal(await rpc('service_role',null,'claim_catalog_job'),null)
  await db.exec("update ingestion_jobs set run_after=now()-interval '1 minute'")
  const second = await rpc('service_role',null,'claim_catalog_job')
  assert.equal(second.attempts,2)
  await rpc('service_role',null,'fail_catalog_job',[second.id,2,'Clave no válida',false], '$1::uuid,$2::integer,$3::text,$4::boolean')
  assert.equal((await rpc('authenticated',A,'get_catalog_status')).last_error,'Clave no válida')
})
test('the scheduler creates only due jobs and removes completed operational records after seven days',async () => {
  await rpc('service_role',null,'schedule_catalog_refresh')
  await rpc('service_role',null,'schedule_catalog_refresh')
  assert.equal((await as('service_role',null,'select count(*)::integer as n from ingestion_jobs'))[0].n,1)
  const job = await rpc('service_role',null,'claim_catalog_job')
  await publish(job)
  await db.exec("update ingestion_jobs set finished_at=now()-interval '8 days'")
  await rpc('service_role',null,'schedule_catalog_refresh')
  assert.equal((await as('service_role',null,'select count(*)::integer as n from ingestion_jobs'))[0].n,0)
})
