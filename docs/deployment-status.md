# GitHub production status

The red production entries inspected on 13 October 2026 were historical GitHub deployment records for earlier commits, including `d6cdc35` and `9864d34`. The latest failed record referenced Actions run `37698478422`, job `113055941933`; those old job logs are no longer available through GitHub's API.

Those revisions had a starter Terraform workflow using a production environment, Terraform Cloud credentials and unconditional Terraform plan steps. The repository has no Terraform infrastructure configuration. That workflow was replaced with conditional validation, and the current workflows perform CI/security checks rather than deploying the application.

The current commit's tests and scans are separate from those historical deployment records. A manual installation on a private server does not automatically update GitHub deployment status. The old records should not be marked successful without an actual verified deployment. If automatic production deployment is desired, it needs a workflow for the actual server and a successful health check, with server credentials kept in GitHub secrets.
