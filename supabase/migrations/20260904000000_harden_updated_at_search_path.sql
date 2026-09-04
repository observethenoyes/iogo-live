-- Pin the trigger function's search_path.
--
-- `handle_updated_at` was created without one, which Supabase's linter flags as
-- `function_search_path_mutable`: any role able to create objects in a schema
-- that appears earlier on the caller's search_path could shadow an unqualified
-- name the function resolves. `now()` lives in pg_catalog, which Postgres always
-- searches first regardless, so an empty search_path is safe here.
--
-- `create or replace` keeps the existing trigger binding intact.

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
