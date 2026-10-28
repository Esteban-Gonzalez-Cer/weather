-- Existing COUNTRIES projects: preserve safe-update protection while explicitly replacing the full catalog.
-- CREATE OR REPLACE retains the existing function permissions.
begin;

create or replace function public.publish_countries(p_job_id uuid,p_attempt integer,p_countries jsonb,p_expected_count integer)
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

commit;
