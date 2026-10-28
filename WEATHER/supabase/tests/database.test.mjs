// Embedded PostgreSQL: validates SQL and RLS without Docker or cloud credentials.
import { before, beforeEach, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { PGlite } = require('@electric-sql/pglite')
const db = new PGlite()
const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
let location

const rpc = async (name, values = []) => (await db.query(`select public.${name}(${values.map((_, i) => `$${i + 1}`).join(',')}) as value`, values)).rows[0].value
async function asRole(role, user, callback) {
  await db.exec(`set role ${role}`)
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || ''])
  try { return await callback() } finally { await db.exec('reset role') }
}
const asUser = (id, callback) => asRole('authenticated', id, callback)
const asService = callback => asRole('service_role', null, callback)

function forecast(temperature = 22) {
  const current = { observed_at: new Date().toISOString(), temp_c: temperature, feelslike_c: 23,
    pressure_hpa: 1012, humidity: 60, cloud: 35, wind_kph: 12, wind_degree: 315, gust_kph: 20,
    uv: 3, condition_code: 1003, condition_text: 'Parcialmente nublado', is_day: true }
  const days = [], hours = []
  const start = new Date().toISOString().slice(0, 10)
  for (let i = 0; i < 3; i++) {
    const timestamp = new Date(`${start}T00:00:00Z`).getTime() + i * 86400000
    const date = new Date(timestamp).toISOString().slice(0, 10)
    days.push({ forecast_date: date, min_temp_c: 14, max_temp_c: 26, condition_code: 1003,
      condition_text: 'Parcialmente nublado', sunrise: `${date}T06:30:00Z`, sunset: `${date}T18:30:00Z`, moon_phase: 'Waxing Gibbous', moon_illumination: 75 })
    for (let h = 0; h < 24; h++) {
      const { observed_at, ...measurements } = current
      hours.push({ forecast_at: new Date(timestamp + h * 3600000).toISOString(), forecast_date: date, ...measurements })
    }
  }
  return { timezone: 'UTC', current, days, hours }
}

async function weatherJob(user = ALICE) {
  const queued = await asUser(user, () => rpc('select_location', [location]))
  const job = await asService(() => rpc('claim_ingestion_job'))
  assert.equal(queued.job_id, job.id)
  return job
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
  `)
  await db.exec(await readFile(new URL('../migrations/001_weather.sql', import.meta.url), 'utf8'))
})
beforeEach(async () => {
  await db.exec('truncate public.locations, public.location_search_cache, public.ingestion_jobs, public.user_recent_locations, auth.users cascade')
  await db.query('insert into auth.users values ($1), ($2)', [ALICE, BOB])
  location = (await db.query("insert into public.locations(provider_id,name,region,country,latitude,longitude) values (1,'Ciudad de México','CDMX','México',19.43,-99.13) returning id")).rows[0].id
})
after(() => db.close())

test('private jobs and recents are isolated, including direct table reads', async () => {
  const queued = await asUser(ALICE, () => rpc('submit_search', ['  Mexico   City  ']))
  const again = await asUser(ALICE, () => rpc('submit_search', ['mexico city']))
  assert.equal(queued.job_id, again.job_id)
  await asUser(ALICE, () => rpc('select_location', [location]))
  await asUser(BOB, async () => {
    assert.equal((await db.query('select * from public.ingestion_jobs')).rows.length, 0)
    assert.equal((await db.query('select * from public.user_recent_locations')).rows.length, 0)
    assert.equal((await db.query('select * from public.locations')).rows.length, 1)
    await assert.rejects(rpc('claim_ingestion_job'), /permission denied/)
    await assert.rejects(db.query('update public.current_weather set temp_c = 99'), /permission denied/)
    await assert.rejects(rpc('publish_weather', [queued.job_id, queued.job_id, JSON.stringify(forecast())]), /permission denied/)
  })
  await asRole('anon', null, async () => {
    await assert.rejects(rpc('weather_bundle', [location]), /permission denied/)
    await assert.rejects(rpc('submit_search', ['Paris']), /permission denied/)
  })
})

test('search publication creates canonical candidates and shared cache without exposing user requests', async () => {
  const queued = await asUser(ALICE, () => rpc('submit_search', ['Springfield']))
  const job = await asService(() => rpc('claim_ingestion_job'))
  await asService(() => rpc('publish_search', [job.id, job.lease_token, JSON.stringify([
    { provider_id: 10, name: 'Springfield', region: 'Illinois', country: 'USA', latitude: 39.8, longitude: -89.6 },
    { provider_id: 11, name: 'Springfield', region: 'Queensland', country: 'Australia', latitude: -27.6, longitude: 152.9 },
  ])]))
  const cache = await asUser(BOB, () => rpc('submit_search', ['springfield']))
  assert.equal(cache.status, 'completed')
  assert.equal(cache.results.length, 2)
  assert.equal(cache.results[0].region, 'Illinois')
  assert.ok(cache.results[0].id)
  assert.equal((await asUser(BOB, () => db.query('select * from public.ingestion_jobs'))).rows.length, 0)
  assert.equal(queued.job_id, job.id)
})

test('publishing weather is atomic, replaces the old horizon, and preserves nulls', async () => {
  const job = await weatherJob()
  const initial = forecast()
  initial.hours[0].uv = null
  await asService(() => rpc('publish_weather', [job.id, job.lease_token, JSON.stringify(initial)]))
  let bundle = await asUser(ALICE, () => rpc('weather_bundle', [location]))
  assert.equal(bundle.hours.length, 72)
  assert.equal(bundle.days.length, 3)
  assert.equal(bundle.hours[0].uv, null)
  assert.equal(bundle.stale, false)
  // Force a refresh, then fail after the current row and daily rows have been replaced.
  await db.query("update public.current_weather set fetched_at = now() - interval '40 minutes'")
  const retry = await weatherJob()
  const invalid = forecast(40)
  invalid.hours[5].humidity = 101
  await assert.rejects(asService(() => rpc('publish_weather', [retry.id, retry.lease_token, JSON.stringify(invalid)])), /check constraint/)
  bundle = await asUser(ALICE, () => rpc('weather_bundle', [location]))
  assert.equal(bundle.current.temp_c, 22)
  assert.equal(bundle.hours.length, 72)
  assert.equal(bundle.stale, true)
  await asService(() => rpc('publish_weather', [retry.id, retry.lease_token, JSON.stringify(forecast(24))]))
  bundle = await asUser(ALICE, () => rpc('weather_bundle', [location]))
  assert.equal(bundle.current.temp_c, 24)
  assert.equal(bundle.hours.length, 72)
  assert.equal((await asUser(ALICE, () => rpc('select_location', [location]))).status, 'completed')
})

test('expired leases recover, and an old worker cannot publish', async () => {
  const first = await weatherJob()
  await db.query("update public.ingestion_jobs set lease_expires_at = now() - interval '1 minute' where id=$1", [first.id])
  const second = await asService(() => rpc('claim_ingestion_job'))
  assert.equal(second.attempts, 2)
  assert.notEqual(second.lease_token, first.lease_token)
  await assert.rejects(asService(() => rpc('publish_weather', [first.id, first.lease_token, JSON.stringify(forecast())])), /Expired job lease/)
  await asService(() => rpc('fail_ingestion_job', [second.id, second.lease_token, 'Temporal', true, 30]))
  assert.equal(await asService(() => rpc('claim_ingestion_job')), null)
  await db.query("update public.ingestion_jobs set available_at=now()-interval '1 second'")
  const third = await asService(() => rpc('claim_ingestion_job'))
  await asService(() => rpc('fail_ingestion_job', [third.id, third.lease_token, 'Sin datos', true, 30]))
  assert.equal((await db.query('select status from public.ingestion_jobs')).rows[0].status, 'failed')
})

test('refreshes track selected cities for 24 hours and do not enqueue duplicates', async () => {
  assert.equal(await asService(() => rpc('enqueue_weather_refreshes')), 0)
  await db.query("update public.locations set last_selected_at=now()-interval '25 hours'")
  assert.equal(await asService(() => rpc('enqueue_weather_refreshes')), 0)
  await db.query('update public.locations set last_selected_at=now()')
  assert.equal(await asService(() => rpc('enqueue_weather_refreshes')), 1)
  assert.equal(await asService(() => rpc('enqueue_weather_refreshes')), 0)
})

test('only five recent cities are kept per user', async () => {
  for (let i = 2; i < 8; i++) {
    const id = (await db.query("insert into public.locations(provider_id,name,country,latitude,longitude) values($1,'City','Country',0,0) returning id", [i])).rows[0].id
    await asUser(ALICE, () => rpc('select_location', [id]))
  }
  assert.equal((await asUser(ALICE, () => db.query('select * from public.user_recent_locations'))).rows.length, 5)
})
