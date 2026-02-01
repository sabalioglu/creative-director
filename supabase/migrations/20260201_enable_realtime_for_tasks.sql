-- Enable Realtime for image_generation_tasks
begin;
  -- Check if table is already in publication to avoid errors (idempotency)
  do $$
  begin
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
      and tablename = 'image_generation_tasks'
    ) then
      alter publication supabase_realtime add table image_generation_tasks;
    end if;
  end
  $$;
commit;
