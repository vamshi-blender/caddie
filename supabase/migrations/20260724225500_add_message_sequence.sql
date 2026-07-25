begin;

alter table public.messages
  add column sequence_number integer not null;

alter table public.messages
  add constraint messages_sequence_number_check
  check (sequence_number >= 0);

alter table public.messages
  add constraint messages_conversation_sequence_key
  unique (conversation_id, sequence_number);

drop index public.messages_conversation_created_idx;

create index messages_conversation_sequence_idx
  on public.messages (conversation_id, sequence_number);

commit;
