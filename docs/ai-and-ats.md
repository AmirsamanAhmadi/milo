# AI, CV matching and ATS readability

Rule-based CV completeness and keyword scores remain available without an AI connection. In **Opportunities**, select **AI assessment & CV tailoring**, or open **Job toolkit** and choose a saved application/paste a job description. Compare the JD with your CV, run an AI assessment, tailor a separate CV draft or generate a custom cover letter. Edited drafts are saved per member and job, and can be downloaded as TXT. The original reviewed CV is never overwritten. Keep facts accurate and review all generated claims.

## Choose a provider

Open **AI settings**. Each member selects their own connection:

| Provider | Configuration | Usage |
| --- | --- | --- |
| OpenAI | Administrator sets `OPENAI_API_KEY` and `OPENAI_MODEL` in ignored `.env` | Server API account billing |
| My OpenAI key | Member saves their key and a supported model in AI settings | Member API account billing |
| Local AI | Administrator sets `LOCAL_AI_URL` and `LOCAL_AI_MODEL`; optional `LOCAL_AI_API_KEY` | Local server resources |
| ChatGPT | Member starts device sign-in, authorizes on OpenAI's page, selects ChatGPT and saves | Member's Codex/ChatGPT plan eligibility and limits |

For Ollama, an example URL from Docker Desktop is `http://host.docker.internal:11434/v1`. Set the model to one you have installed. The local endpoint must support OpenAI-compatible `/chat/completions` with JSON-schema output. It is configured by the administrator, not accepted as an arbitrary browser URL. Restart with `docker compose up -d` after changing `.env`. See [Ollama compatibility](https://docs.ollama.com/api/openai-compatibility).

OpenAI uses the [Responses API with structured output](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses) and `store:false`. Choose a model available to your API account; Milo does not infer entitlement from a model name. Personal API keys use AES-256-GCM encryption in SQLite. The encryption key is a mode-0600 file at `/data/provider-key`; protect and back it up with the private data volume. Account sign-in does not provide API credits.

ChatGPT sign-in uses the pinned Codex CLI's documented [device authentication](https://developers.openai.com/codex/auth). Enable device sign-in in your ChatGPT security settings if required, start sign-in from Milo, and enter only that generated code on OpenAI's sign-in page. Each member gets a separate `/data/codex/<member-id>` credential directory. Disconnect removes that member's auth file and stops pending login. Credentials are never returned to the browser. Device flow and model access depend on account/workspace policy; live account authorization must be completed by the member.

Selecting ChatGPT loads model suggestions through Codex app-server's [`model/list`](https://learn.chatgpt.com/docs/app-server#list-models-modellist) using that member's credential directory. The Model field offers an editable dropdown: select a model identifier, edit it, or leave it blank for the account default, then save the connection. Suggestions refresh after sign-in and can be refreshed manually. Other providers keep manual model entry. Codex may return a cached or bundled catalog, so suggestions are not a guarantee of account entitlement; generation confirms access. Failed lookups leave manual entry available and do not change the selected model.

Codex generation runs an ephemeral structured-output request from a temporary directory, with shell tools, apps, plugins, browser/computer tools, images, multi-agent features and workspace dependency tools disabled. Its environment excludes administrator API keys and other member credentials. API and local requests have bounded time/output limits. Two AI generations can run concurrently; requests are throttled. No automatic generation or application submission occurs.

## What the scores mean

The existing rule score counts recognized CV/job keyword topics. The AI score is a separate model judgment based on the CV and JD, with supported strengths, evidence gaps, recommendations and ATS notes. Neither score predicts an employer's decision or guarantees an interview. Drafting instructions prohibit invented experience, degrees, dates, metrics and eligibility. Documents are treated as untrusted data rather than model instructions, and provider output is validated before it is stored.

ATS products handle parsing and candidate search differently. [Greenhouse](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse) documents problems with columns, tables, graphics and contact details in headers, and a 2.5 MB parsing limit. [Lever](https://help.lever.co/s/article/Searching-the-Database-for-Candidates) describes recruiter searches over parsed resumes and other candidate-profile content. These documents support readability and truthful relevant wording; they do not establish a universal ATS score.

Milo checks extracted text and sections, and recommends simple headings and one-column output. It cannot verify visual layout, every ATS vendor or employer screening settings from extracted text. Scanned PDFs require OCR/pasted text. Avoid hidden keyword stuffing. AI-generated plain-text CVs and letters remain drafts until you review them.

## Verification and CI

Automated tests mock provider responses to verify schema validation, errors, per-member ownership, encrypted-key isolation, retained rule scores and separate editable drafts. They do not claim a live API generation without configured credentials/model access. Local endpoint and account authorization are separate setup requirements.

The October 2026 CI audit found that Milo CI passed, while Snyk failed on hardcoded invalid/mismatch password fixtures and vulnerable `pypdf==6.1.1`. The fixtures now use generated input, pypdf is upgraded to 6.20.0, and the runtime uses updated Alpine packages and published Python binary wheels after Debian base-image findings remained. Python dependency scanning and Python test setup are included explicitly. Security findings remain enforced; they are not hidden with `continue-on-error`. [The verified Snyk run](https://github.com/AmirsamanAhmadi/milo/actions/runs/38213366492) passed code, dependency and container scans, with no vulnerable paths found across the three container projects.
