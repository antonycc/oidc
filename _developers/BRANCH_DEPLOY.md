Chat GPT prompt
```
Please make a detailed plan of the changes required so that when the repository 
https://github.com/antonycc/oidc is running `.github/workflows/test-and-deploy.yml`
in a branch other than `main`, instead of not deploying, the whole thing is deployed to a 
ci stack with there being just 1 ci version of cognito and observability but an
oidcprovider stack per branch named along the lines of ci-<16 chars of branch name> 
and use this name the stack name and all the cloudformation resource names and
for physical names such as domain names and table names. Clean the deployment 
name to be suitable for all these occasions. If 16 characters is not feasible
anywhere use 8 but if it's just a couple of small spots, use a mechanism to
truncate without likely clashes. With the ci deployments in place, remove the
conditions around the behaviour tests and make sure sure that where there are 
URLs the endpoints hit are the ones for that specific stack. Also also a deployment 
name to be added as a parameter which would deploy all 3 stacks using that name. After
 all the test steps have run and passed and as long as the deployment wasn't skipped 
 on branches other than main and parameter named targets other than "main" and "ci", 
 delete the ephemeral oidc provider stack. Include set up steps such as certificates
  with wildcards to cover any ci environment. I want the domaining to follow the patterns;
   prod (from branch `main`): oidc.antonycc.com / auth.oidc.antonycc.com, 
   ci (set by param): ci.oidc.antonycc.com / ci.auth.oidc.antonycc.com, 
   ci-<branch> (from branch (not `main`)): ci-branch.oidc.antonycc.com / ci-branch.auth.oidc.antonycc.com. 
Please include details of which documents need to be updated.
```

Chat GPT response
```

```