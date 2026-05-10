do $$
begin
	if not exists (
		select 1
		from pg_constraint
		where conname = 'guests_id_number_unique'
	) then
		alter table public.guests
		add constraint guests_id_number_unique unique (id_number);
	end if;
end $$;
