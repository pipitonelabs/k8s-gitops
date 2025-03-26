- Delete an entry from gatus db if you don't want to monitor it anymore
```
kubectl exec -it <postgres-pod-name> -n <namespace> -- bash
psql -U <username> -d <database-name>
select * from endpoints;
delete from endpoints where name = 'whatever';
```

- List all tables
```
\dt
```