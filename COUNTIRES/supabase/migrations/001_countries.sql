-- Run on a NEW Supabase project. Never apply to the WEATHER project.
begin;

create table public.countries (
    code text primary key check (code ~ '^[A-Z]{3}$'),
    alpha2 text not null unique check (alpha2 ~ '^[A-Z]{2}$'),
    name text not null check (length(name) between 1 and 200),
    official_name text not null,
    spanish_name text,
    native_names jsonb not null default '{}' check (jsonb_typeof(native_names) = 'object'),
    region text not null check (length(region) between 1 and 80),
    subregion text,
    capitals text[] not null default '{}',
    population bigint check (population >= 0),
    area_km2 numeric check (area_km2 >= 0),
    languages jsonb not null default '[]' check (jsonb_typeof(languages) = 'array'),
    currencies jsonb not null default '[]' check (jsonb_typeof(currencies) = 'array'),
    timezones text[] not null default '{}',
    borders text[] not null default '{}',
    continents text[] not null default '{}',
    calling_codes text[] not null default '{}',
    tlds text[] not null default '{}',
    latitude numeric check (latitude between -90 and 90),
    longitude numeric check (longitude between -180 and 180),
    independent boolean,
    un_member boolean,
    flag_png_base64 text not null check (
        length(flag_png_base64) between 20 and 350000
        and flag_png_base64 ~ '^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$'
    ),
    search_text text not null,
    ingested_at timestamptz not null default now()
);
create index countries_region_idx on public.countries(region);

create table public.catalog_state (
    id boolean primary key default true check (id),
    last_success_at timestamptz,
    country_count integer not null default 0,
    status text not null default 'idle' check (status in ('idle','queued','processing','failed')),
    last_error text,
    provider text not null default 'REST Countries v5'
);
insert into public.catalog_state(id) values (true);

create table public.ingestion_jobs (
    id uuid primary key default gen_random_uuid(),
    requested_by uuid references auth.users(id) on delete set null,
    status text not null default 'queued' check (status in ('queued','processing','succeeded','failed')),
    attempts integer not null default 0 check (attempts between 0 and 3),
    run_after timestamptz not null default now(),
    claimed_at timestamptz,
    error text,
    created_at timestamptz not null default now(),
    finished_at timestamptz
);
-- A catalog is shared. At most one queued/processing refresh is necessary.
create unique index one_active_catalog_job on public.ingestion_jobs ((true))
    where status in ('queued','processing');

alter table public.countries enable row level security;
alter table public.catalog_state enable row level security;
alter table public.ingestion_jobs enable row level security;
create policy countries_read on public.countries for select to authenticated using (true);
create policy catalog_read on public.catalog_state for select to authenticated using (true);
create policy own_jobs_read on public.ingestion_jobs for select to authenticated using (requested_by = auth.uid());
revoke all on public.countries, public.catalog_state, public.ingestion_jobs from anon, authenticated;
grant select on public.countries, public.catalog_state, public.ingestion_jobs to authenticated;
grant all on public.countries, public.catalog_state, public.ingestion_jobs to service_role;

create function public.fold_country_text(value text) returns text
language sql immutable strict set search_path = public, pg_temp as $$
    select translate(lower(value), 'áéíóúüñàèìòùâêîôûäëïöÿç', 'aeiouunaeiouaeiouaeioyc');
$$;

-- All catalog content, including flags, is read from the database.
create function public.get_countries(p_query text default '', p_region text default '',
    p_sort text default 'name', p_page integer default 1, p_page_size integer default 12)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare result jsonb;
begin
    if length(p_query) > 100 or length(p_region) > 80 or p_page < 1 or p_page > 1000
       or p_page_size < 1 or p_page_size > 48 or p_sort not in ('name','population','area') then
        raise sqlstate 'PT422' using message = 'Filtros no válidos.';
    end if;
    with matching as (
        select c.* from public.countries c
        where (p_region = '' or c.region = p_region)
          and (p_query = '' or strpos(c.search_text, public.fold_country_text(trim(p_query))) > 0)
    ), page as (
        select code, alpha2, name, spanish_name, region, capitals, population, area_km2, flag_png_base64
        from matching
        order by case when p_sort = 'population' then population end desc nulls last,
                 case when p_sort = 'area' then area_km2 end desc nulls last,
                 public.fold_country_text(coalesce(spanish_name,name)), code
        limit p_page_size offset (p_page-1)*p_page_size
    )
    select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),
        'total',(select count(*) from matching),'page',p_page,'page_size',p_page_size) into result;
    return result;
end;
$$;

create function public.get_catalog_status() returns jsonb language sql stable security invoker
set search_path = public, pg_temp as $$
    select jsonb_build_object('total',s.country_count,'last_success_at',s.last_success_at,
        'status',s.status,'last_error',s.last_error,'provider',s.provider,
        'stale',s.last_success_at is null or s.last_success_at < now()-interval '48 hours',
        'regions',coalesce((select jsonb_agg(r order by r.name) from
            (select region as name,count(*) as count from public.countries group by region) r),'[]'))
    from public.catalog_state s where s.id;
$$;

create function public.request_catalog_refresh() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare active public.ingestion_jobs; new_id uuid;
begin
    if auth.uid() is null then raise sqlstate 'PT401' using message = 'Inicia sesión con Google.'; end if;
    perform pg_advisory_xact_lock(138906101);
    if exists (select 1 from public.catalog_state where last_success_at > now()-interval '24 hours') then
        return jsonb_build_object('status','fresh','job_id',null);
    end if;
    select * into active from public.ingestion_jobs where status in ('queued','processing') limit 1;
    if found then
        return jsonb_build_object('status',active.status,'job_id',
            case when active.requested_by = auth.uid() then active.id else null end);
    end if;
    if exists(select 1 from public.ingestion_jobs where requested_by=auth.uid() and created_at > now()-interval '1 minute') then
        raise sqlstate 'PT429' using message = 'Espera un minuto antes de volver a solicitar la carga.';
    end if;
    insert into public.ingestion_jobs(requested_by) values(auth.uid()) returning id into new_id;
    update public.catalog_state set status='queued',last_error=null where id;
    return jsonb_build_object('status','queued','job_id',new_id);
end;
$$;

create function public.schedule_catalog_refresh() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
    perform pg_advisory_xact_lock(138906101);
    delete from public.ingestion_jobs where status in ('succeeded','failed') and finished_at < now()-interval '7 days';
    if not exists(select 1 from public.catalog_state where last_success_at > now()-interval '24 hours')
       and not exists(select 1 from public.ingestion_jobs where status in ('queued','processing')) then
        insert into public.ingestion_jobs default values;
        update public.catalog_state set status='queued',last_error=null where id;
    end if;
end;
$$;

create function public.claim_catalog_job() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare claimed public.ingestion_jobs;
begin
    perform pg_advisory_xact_lock(138906101);
    update public.ingestion_jobs set status='failed',finished_at=now(),error='La carga se interrumpió tras tres intentos.'
        where status='processing' and claimed_at < now()-interval '10 minutes' and attempts >= 3;
    if found then update public.catalog_state set status='failed',last_error='La carga se interrumpió tras tres intentos.' where id; end if;
    update public.ingestion_jobs set status='queued',run_after=now(),claimed_at=null
        where status='processing' and claimed_at < now()-interval '10 minutes' and attempts < 3;
    select * into claimed from public.ingestion_jobs where status='queued' and run_after <= now()
        order by created_at for update skip locked limit 1;
    if not found then return null; end if;
    update public.ingestion_jobs set status='processing',attempts=attempts+1,claimed_at=now(),error=null
        where id=claimed.id returning * into claimed;
    update public.catalog_state set status='processing',last_error=null where id;
    return to_jsonb(claimed);
end;
$$;

create function public.fail_catalog_job(p_job_id uuid,p_attempt integer,p_error text,p_retryable boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare next_status text;
begin
    select case when p_retryable and attempts < 3 then 'queued' else 'failed' end into next_status
        from public.ingestion_jobs where id=p_job_id and status='processing' and attempts=p_attempt for update;
    if not found then return false; end if;
    update public.ingestion_jobs set status=next_status,error=left(p_error,240),
        run_after=now()+make_interval(mins => p_attempt),
        finished_at=case when next_status='failed' then now() else null end where id=p_job_id;
    update public.catalog_state set status=next_status,last_error=left(p_error,240) where id;
    return true;
end;
$$;

-- Replaces the entire validated snapshot in ONE PostgreSQL transaction.
-- Any constraint error rolls back the delete, inserts, state and job update.
create function public.publish_countries(p_job_id uuid,p_attempt integer,p_countries jsonb,p_expected_count integer)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare published integer;
begin
    perform 1 from public.ingestion_jobs where id=p_job_id and status='processing' and attempts=p_attempt for update;
    if not found then raise sqlstate 'PT409' using message='La solicitud ya no pertenece a este proceso.'; end if;
    if p_countries is null or p_expected_count is null or jsonb_typeof(p_countries) <> 'array' or p_expected_count not between 200 and 400
       or jsonb_array_length(p_countries) <> p_expected_count then
        raise sqlstate 'PT422' using message='El catálogo recibido está incompleto.';
    end if;
    delete from public.countries where true;
    insert into public.countries (
        code,alpha2,name,official_name,spanish_name,native_names,region,subregion,capitals,population,area_km2,
        languages,currencies,timezones,borders,continents,calling_codes,tlds,latitude,longitude,
        independent,un_member,flag_png_base64,search_text,ingested_at
    ) select code,alpha2,name,official_name,spanish_name,native_names,region,subregion,capitals,population,area_km2,
        languages,currencies,timezones,borders,continents,calling_codes,tlds,latitude,longitude,
        independent,un_member,flag_png_base64,search_text,now()
    from jsonb_populate_recordset(null::public.countries,p_countries);
    get diagnostics published = row_count;
    update public.catalog_state set last_success_at=now(),country_count=published,status='idle',last_error=null where id;
    update public.ingestion_jobs set status='succeeded',finished_at=now(),error=null where id=p_job_id;
    return published;
end;
$$;

-- PostgreSQL grants functions to PUBLIC by default. Explicitly close every entry.
revoke all on function public.fold_country_text(text),public.get_countries(text,text,text,integer,integer),
    public.get_catalog_status(),public.request_catalog_refresh(),public.schedule_catalog_refresh(),
    public.claim_catalog_job(),public.fail_catalog_job(uuid,integer,text,boolean),
    public.publish_countries(uuid,integer,jsonb,integer) from public,anon,authenticated;
grant execute on function public.fold_country_text(text),public.get_countries(text,text,text,integer,integer),
    public.get_catalog_status(),public.request_catalog_refresh() to authenticated;
grant execute on function public.schedule_catalog_refresh(),public.claim_catalog_job(),
    public.fail_catalog_job(uuid,integer,text,boolean),public.publish_countries(uuid,integer,jsonb,integer) to service_role;

commit;
