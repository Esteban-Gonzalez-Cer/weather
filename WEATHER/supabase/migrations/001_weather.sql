-- Apply to a hosted Supabase project with the SQL editor, in filename order.
begin;

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  provider_id bigint not null unique,
  name text not null,
  region text not null default '',
  country text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  timezone text,
  last_selected_at timestamptz
);

create table public.current_weather (
  location_id uuid primary key references public.locations on delete cascade,
  observed_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  temp_c real, feelslike_c real,
  condition_code integer, condition_text text, is_day boolean,
  pressure_hpa real check (pressure_hpa >= 0),
  humidity real check (humidity between 0 and 100),
  cloud real check (cloud between 0 and 100),
  wind_kph real check (wind_kph >= 0),
  wind_degree real check (wind_degree between 0 and 360),
  gust_kph real check (gust_kph >= 0),
  uv real check (uv >= 0)
);

create table public.daily_forecasts (
  location_id uuid not null references public.locations on delete cascade,
  forecast_date date not null,
  min_temp_c real, max_temp_c real,
  condition_code integer, condition_text text,
  sunrise timestamptz, sunset timestamptz,
  moon_phase text,
  moon_illumination real check (moon_illumination between 0 and 100),
  primary key (location_id, forecast_date),
  check (min_temp_c <= max_temp_c)
);

create table public.hourly_forecasts (
  location_id uuid not null references public.locations on delete cascade,
  forecast_at timestamptz not null,
  forecast_date date not null,
  temp_c real, feelslike_c real,
  condition_code integer, condition_text text, is_day boolean,
  pressure_hpa real check (pressure_hpa >= 0),
  humidity real check (humidity between 0 and 100),
  cloud real check (cloud between 0 and 100),
  wind_kph real check (wind_kph >= 0),
  wind_degree real check (wind_degree between 0 and 360),
  gust_kph real check (gust_kph >= 0),
  uv real check (uv >= 0),
  primary key (location_id, forecast_at),
  foreign key (location_id, forecast_date)
    references public.daily_forecasts on delete cascade
);
create index hourly_forecasts_by_date on public.hourly_forecasts(location_id, forecast_date);

create table public.location_search_cache (
  query text primary key,
  results jsonb not null check (jsonb_typeof(results) = 'array'),
  expires_at timestamptz not null
);

create table public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users on delete cascade,
  kind text not null check (kind in ('search', 'weather')),
  query text,
  location_id uuid references public.locations on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  results jsonb,
  attempts integer not null default 0 check (attempts between 0 and 3),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'search' and query is not null and length(query) between 2 and 100 and location_id is null)
    or (kind = 'weather' and query is null and location_id is not null))
);
create index ingestion_jobs_queue on public.ingestion_jobs(available_at, created_at)
  where status = 'queued';
create index ingestion_jobs_user on public.ingestion_jobs(requested_by, created_at desc);
create index ingestion_jobs_location on public.ingestion_jobs(location_id) where status in ('queued', 'processing');

create table public.user_recent_locations (
  user_id uuid not null references auth.users on delete cascade,
  location_id uuid not null references public.locations on delete cascade,
  selected_at timestamptz not null default now(),
  primary key (user_id, location_id)
);
create index recent_locations_user on public.user_recent_locations(user_id, selected_at desc);

-- Clients can read weather. Only the ingestion identity can modify provider data.
alter table public.locations enable row level security;
alter table public.current_weather enable row level security;
alter table public.daily_forecasts enable row level security;
alter table public.hourly_forecasts enable row level security;
alter table public.location_search_cache enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.user_recent_locations enable row level security;

revoke all on public.locations, public.current_weather, public.daily_forecasts,
  public.hourly_forecasts, public.location_search_cache, public.ingestion_jobs,
  public.user_recent_locations from anon, authenticated;
grant select on public.locations, public.current_weather, public.daily_forecasts,
  public.hourly_forecasts, public.location_search_cache, public.ingestion_jobs,
  public.user_recent_locations to authenticated;
grant all on public.locations, public.current_weather, public.daily_forecasts,
  public.hourly_forecasts, public.location_search_cache, public.ingestion_jobs,
  public.user_recent_locations to service_role;

create policy locations_read on public.locations for select to authenticated using (true);
create policy current_weather_read on public.current_weather for select to authenticated using (true);
create policy daily_forecasts_read on public.daily_forecasts for select to authenticated using (true);
create policy hourly_forecasts_read on public.hourly_forecasts for select to authenticated using (true);
create policy search_cache_read on public.location_search_cache for select to authenticated using (true);
create policy jobs_read_own on public.ingestion_jobs for select to authenticated using ((select auth.uid()) = requested_by);
create policy recent_read_own on public.user_recent_locations for select to authenticated using ((select auth.uid()) = user_id);

create function public.weather_bundle(p_location_id uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'location', to_jsonb(l) - 'last_selected_at',
    'current', (select to_jsonb(c) from public.current_weather c where c.location_id = l.id),
    'days', coalesce((select jsonb_agg(to_jsonb(d) order by d.forecast_date)
      from public.daily_forecasts d where d.location_id = l.id
      and d.forecast_date between (now() at time zone coalesce(l.timezone, 'UTC'))::date
        and (now() at time zone coalesce(l.timezone, 'UTC'))::date + 2), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(to_jsonb(h) order by h.forecast_at)
      from public.hourly_forecasts h where h.location_id = l.id
      and h.forecast_date between (now() at time zone coalesce(l.timezone, 'UTC'))::date
        and (now() at time zone coalesce(l.timezone, 'UTC'))::date + 2), '[]'::jsonb),
    'stale', not exists (select 1 from public.current_weather c
      where c.location_id = l.id and c.fetched_at > now() - interval '35 minutes')
      or (select count(*) from public.daily_forecasts d where d.location_id = l.id
        and d.forecast_date between (now() at time zone coalesce(l.timezone, 'UTC'))::date
        and (now() at time zone coalesce(l.timezone, 'UTC'))::date + 2) <> 3
  ) from public.locations l where l.id = p_location_id;
$$;

create function public.submit_search(p_query text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare q text; cached jsonb; job_id uuid; uid uuid := auth.uid();
begin
  if uid is null then raise insufficient_privilege; end if;
  q := regexp_replace(lower(trim(p_query)), '\s+', ' ', 'g');
  if q is null or length(q) not between 2 and 100 then
    raise sqlstate 'PT422' using message = 'Escribe entre 2 y 100 caracteres.';
  end if;
  select results into cached from public.location_search_cache where query = q and expires_at > now();
  if found then return jsonb_build_object('status', 'completed', 'results', cached); end if;
  perform pg_advisory_xact_lock(hashtextextended('search:' || uid::text || ':' || q, 0));
  select id into job_id from public.ingestion_jobs where requested_by = uid and kind = 'search'
    and query = q and status in ('queued', 'processing') order by created_at limit 1;
  if job_id is null then
    if (select count(*) from public.ingestion_jobs where requested_by = uid and created_at > now() - interval '1 minute') >= 10 then
      raise sqlstate 'PT429' using message = 'Demasiadas solicitudes. Intenta en un minuto.';
    end if;
    insert into public.ingestion_jobs(requested_by, kind, query) values (uid, 'search', q) returning id into job_id;
  end if;
  return jsonb_build_object('status', 'queued', 'job_id', job_id);
end;
$$;

create function public.select_location(p_location_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); data jsonb; job_id uuid;
begin
  if uid is null then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(hashtextextended('selection:' || uid::text, 0));
  if not exists (select 1 from public.locations where id = p_location_id) then
    raise sqlstate 'PT404' using message = 'Ubicación no encontrada.';
  end if;
  update public.locations set last_selected_at = now() where id = p_location_id;
  insert into public.user_recent_locations(user_id, location_id) values (uid, p_location_id)
    on conflict (user_id, location_id) do update set selected_at = excluded.selected_at;
  delete from public.user_recent_locations where user_id = uid and location_id not in (
    select location_id from public.user_recent_locations where user_id = uid order by selected_at desc, location_id limit 5
  );
  data := public.weather_bundle(p_location_id);
  if not (data->>'stale')::boolean and exists (select 1 from public.current_weather
    where location_id = p_location_id and fetched_at > now() - interval '30 minutes') then
    return jsonb_build_object('status', 'completed', 'data', data);
  end if;
  select id into job_id from public.ingestion_jobs where requested_by = uid and kind = 'weather'
    and location_id = p_location_id and status in ('queued', 'processing') order by created_at limit 1;
  if job_id is null then
    if (select count(*) from public.ingestion_jobs where requested_by = uid and created_at > now() - interval '1 minute') >= 10 then
      raise sqlstate 'PT429' using message = 'Demasiadas solicitudes. Intenta en un minuto.';
    end if;
    insert into public.ingestion_jobs(requested_by, kind, location_id)
      values (uid, 'weather', p_location_id) returning id into job_id;
  end if;
  return jsonb_build_object('status', 'queued', 'job_id', job_id, 'data', data);
end;
$$;

-- Lease tokens prevent a timed-out worker from publishing over a later attempt.
create function public.claim_ingestion_job() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare job public.ingestion_jobs;
begin
  update public.ingestion_jobs set status = case when attempts >= 3 then 'failed' else 'queued' end,
    error = case when attempts >= 3 then 'La carga se interrumpió. Vuelve a intentarlo.' else null end,
    lease_token = null, lease_expires_at = null, available_at = now(), updated_at = now()
    where status = 'processing' and lease_expires_at < now();
  select * into job from public.ingestion_jobs where status = 'queued' and available_at <= now()
    order by available_at, created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.ingestion_jobs set status = 'processing', attempts = attempts + 1,
    lease_token = gen_random_uuid(), lease_expires_at = now() + interval '2 minutes', updated_at = now()
    where id = job.id returning * into job;
  return to_jsonb(job);
end;
$$;

create function public.resolve_cached_job(p_job_id uuid, p_lease uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare job public.ingestion_jobs; cached jsonb; bundle jsonb;
begin
  select * into job from public.ingestion_jobs where id = p_job_id and status = 'processing'
    and lease_token = p_lease and lease_expires_at > now() for update;
  if not found then raise exception 'Expired job lease'; end if;
  if job.kind = 'search' then
    select results into cached from public.location_search_cache where query = job.query and expires_at > now();
    if not found then return false; end if;
  else
    bundle := public.weather_bundle(job.location_id);
    if (bundle->>'stale')::boolean or not exists (select 1 from public.current_weather
      where location_id = job.location_id and fetched_at > now() - interval '30 minutes') then return false; end if;
    cached := jsonb_build_object('location_id', job.location_id);
  end if;
  update public.ingestion_jobs set status = 'completed', results = cached, error = null,
    lease_token = null, lease_expires_at = null, updated_at = now() where id = job.id;
  return true;
end;
$$;

create function public.publish_search(p_job_id uuid, p_lease uuid, p_locations jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare job public.ingestion_jobs; item jsonb; loc public.locations; result jsonb := '[]';
begin
  select * into job from public.ingestion_jobs where id = p_job_id and kind = 'search'
    and status = 'processing' and lease_token = p_lease and lease_expires_at > now() for update;
  if not found then raise exception 'Expired job lease'; end if;
  for item in select * from jsonb_array_elements(p_locations) loop
    insert into public.locations(provider_id, name, region, country, latitude, longitude)
      values ((item->>'provider_id')::bigint, item->>'name', coalesce(item->>'region', ''), item->>'country',
        (item->>'latitude')::double precision, (item->>'longitude')::double precision)
      on conflict (provider_id) do update set name = excluded.name, region = excluded.region,
        country = excluded.country, latitude = excluded.latitude, longitude = excluded.longitude
      returning * into loc;
    result := result || jsonb_build_array(to_jsonb(loc) - 'last_selected_at');
  end loop;
  insert into public.location_search_cache(query, results, expires_at) values (job.query, result, now() + interval '24 hours')
    on conflict (query) do update set results = excluded.results, expires_at = excluded.expires_at;
  update public.ingestion_jobs set status = 'completed', results = result, error = null,
    lease_token = null, lease_expires_at = null, updated_at = now() where id = job.id;
end;
$$;

create function public.publish_weather(p_job_id uuid, p_lease uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare job public.ingestion_jobs; current_data jsonb; item jsonb;
begin
  select * into job from public.ingestion_jobs where id = p_job_id and kind = 'weather'
    and status = 'processing' and lease_token = p_lease and lease_expires_at > now() for update;
  if not found then raise exception 'Expired job lease'; end if;
  if coalesce(jsonb_array_length(p_payload->'days'), 0) <> 3 or coalesce(jsonb_array_length(p_payload->'hours'), 0) < 69 then
    raise exception 'Incomplete forecast';
  end if;
  update public.locations set timezone = p_payload->>'timezone' where id = job.location_id;
  current_data := p_payload->'current';
  insert into public.current_weather
    select job.location_id, (current_data->>'observed_at')::timestamptz, now(), r.temp_c, r.feelslike_c,
      r.condition_code, r.condition_text, r.is_day, r.pressure_hpa, r.humidity, r.cloud,
      r.wind_kph, r.wind_degree, r.gust_kph, r.uv
    from jsonb_to_record(current_data) as r(temp_c real, feelslike_c real, condition_code integer,
      condition_text text, is_day boolean, pressure_hpa real, humidity real, cloud real,
      wind_kph real, wind_degree real, gust_kph real, uv real)
    on conflict (location_id) do update set observed_at = excluded.observed_at, fetched_at = excluded.fetched_at,
      temp_c = excluded.temp_c, feelslike_c = excluded.feelslike_c, condition_code = excluded.condition_code,
      condition_text = excluded.condition_text, is_day = excluded.is_day, pressure_hpa = excluded.pressure_hpa,
      humidity = excluded.humidity, cloud = excluded.cloud, wind_kph = excluded.wind_kph,
      wind_degree = excluded.wind_degree, gust_kph = excluded.gust_kph, uv = excluded.uv;
  -- Replacement and job completion happen in this same transaction.
  delete from public.daily_forecasts where location_id = job.location_id;
  insert into public.daily_forecasts
    select job.location_id, r.* from jsonb_to_recordset(p_payload->'days') as r(forecast_date date,
      min_temp_c real, max_temp_c real, condition_code integer, condition_text text,
      sunrise timestamptz, sunset timestamptz, moon_phase text, moon_illumination real);
  insert into public.hourly_forecasts
    select job.location_id, r.* from jsonb_to_recordset(p_payload->'hours') as r(forecast_at timestamptz,
      forecast_date date, temp_c real, feelslike_c real, condition_code integer, condition_text text,
      is_day boolean, pressure_hpa real, humidity real, cloud real, wind_kph real, wind_degree real,
      gust_kph real, uv real);
  if (select count(*) from public.daily_forecasts d join public.locations l on l.id = d.location_id
      where d.location_id = job.location_id and d.forecast_date between (now() at time zone l.timezone)::date
      and (now() at time zone l.timezone)::date + 2) <> 3 then raise exception 'Forecast dates do not cover the local three-day window'; end if;
  update public.ingestion_jobs set status = 'completed', results = jsonb_build_object('location_id', job.location_id),
    error = null, lease_token = null, lease_expires_at = null, updated_at = now() where id = job.id;
end;
$$;

create function public.fail_ingestion_job(p_job_id uuid, p_lease uuid, p_error text,
  p_retryable boolean, p_retry_after integer default 30) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.ingestion_jobs set
    status = case when p_retryable and attempts < 3 then 'queued' else 'failed' end,
    available_at = now() + make_interval(secs => greatest(30, least(3600, p_retry_after))),
    error = left(p_error, 240), lease_token = null, lease_expires_at = null, updated_at = now()
    where id = p_job_id and status = 'processing' and lease_token = p_lease and lease_expires_at > now();
end;
$$;

create function public.enqueue_weather_refreshes() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare affected integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('weather-refreshes', 0));
  insert into public.ingestion_jobs(kind, location_id)
    select 'weather', l.id from public.locations l left join public.current_weather c on c.location_id = l.id
    where l.last_selected_at > now() - interval '24 hours'
      and (c.fetched_at is null or c.fetched_at <= now() - interval '30 minutes' or (public.weather_bundle(l.id)->>'stale')::boolean)
      and not exists (select 1 from public.ingestion_jobs j where j.location_id = l.id and j.status in ('queued', 'processing'));
  get diagnostics affected = row_count;
  delete from public.location_search_cache where expires_at < now();
  delete from public.ingestion_jobs where status in ('completed', 'failed') and updated_at < now() - interval '7 days';
  return affected;
end;
$$;

-- PostgreSQL functions otherwise grant EXECUTE to PUBLIC by default.
revoke all on function public.weather_bundle(uuid), public.submit_search(text), public.select_location(uuid),
  public.claim_ingestion_job(), public.resolve_cached_job(uuid, uuid), public.publish_search(uuid, uuid, jsonb),
  public.publish_weather(uuid, uuid, jsonb), public.fail_ingestion_job(uuid, uuid, text, boolean, integer),
  public.enqueue_weather_refreshes() from public, anon, authenticated;
grant execute on function public.weather_bundle(uuid), public.submit_search(text), public.select_location(uuid) to authenticated;
grant execute on function public.weather_bundle(uuid), public.claim_ingestion_job(), public.resolve_cached_job(uuid, uuid),
  public.publish_search(uuid, uuid, jsonb), public.publish_weather(uuid, uuid, jsonb),
  public.fail_ingestion_job(uuid, uuid, text, boolean, integer), public.enqueue_weather_refreshes() to service_role;

commit;
