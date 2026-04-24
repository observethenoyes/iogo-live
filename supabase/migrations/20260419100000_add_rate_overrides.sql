-- Optional per-user rate overrides. When set, the calculator uses these
-- instead of the live Octopus API rates. All values are in pence.
-- NULL = use the API rate (default behaviour).

alter table public.user_credentials
  add column peak_rate_override numeric,
  add column off_peak_rate_override numeric,
  add column standing_charge_override numeric;

comment on column public.user_credentials.peak_rate_override is 'Custom peak rate in p/kWh (inc VAT). NULL = use API rate.';
comment on column public.user_credentials.off_peak_rate_override is 'Custom off-peak rate in p/kWh (inc VAT). NULL = use API rate.';
comment on column public.user_credentials.standing_charge_override is 'Custom standing charge in p/day (inc VAT). NULL = use API rate.';
