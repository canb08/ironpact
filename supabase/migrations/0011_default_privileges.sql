-- H5 / H3-G7: future objects start closed; existing object grants are untouched.
-- Every later migration must grant privileges explicitly (as 0010 already does).
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, public;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, public;

-- PostgreSQL grants PUBLIC EXECUTE globally by default. A schema-local REVOKE
-- cannot subtract a global grant, so remove that function default as well.
alter default privileges for role postgres
  revoke execute on functions from anon, authenticated, public;
