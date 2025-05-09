### SSO
For Authentik, I've created an Infrastructure policy because my Authentik Infrastructure group contains myself (admin) 

- Create the policy:

```
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["admin:*"]
    },
    {
      "Effect": "Allow",
      "Action": ["kms:*"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:*"],
      "Resource": ["arn:aws:s3:::*"]
    }
  ]
}
```

- Apply the policy
```
mc admin policy create minio Infrastructure kubernetes/apps/database/minio/infrastructure-policy.json
```