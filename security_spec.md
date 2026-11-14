# Security Specification - FootballIQ Platform

## 1. Data Invariants
1. Users can only write their own user profile document (`/users/{userId}` where `userId == request.auth.uid`).
2. Ordinary users cannot escalate their role to `admin`. Only `dj20pndmix@gmail.com` is granted administrative rights automatically.
3. Prediction documents in `/predictions/{predictionId}` are viewable by authenticated users; writes require administrative rights.
4. Sync jobs in `/sync_jobs/{jobId}` are viewable and writable only by administrators.
5. Video generations in `/video_generations/{genId}` belong strictly to the creating user (`userId == request.auth.uid`). Users can only query their own videos.

## 2. The Dirty Dozen Payloads & Mitigation
1. **Payload 1 (User Role Escalation)**: User sends `{ "role": "admin" }` during registration or update.
   - *Mitigation*: User creation forbids setting role to `admin` unless `request.auth.token.email == 'dj20pndmix@gmail.com'`. User updates forbid changing `role`.
2. **Payload 2 (Impersonation Write)**: User A writes to `/users/userB`.
   - *Mitigation*: Rule enforces `request.auth.uid == userId`.
3. **Payload 3 (Arbitrary Field Injection in User)**: User injects unvalidated fields like `isVip: true`.
   - *Mitigation*: Validation enforces strict keys.
4. **Payload 4 (Tampering Prediction Probabilities)**: Non-admin modifies a prediction outcome to mark a bet as won.
   - *Mitigation*: `/predictions/{predictionId}` write requires `isAdmin()`.
5. **Payload 5 (Unauthenticated Prediction Read)**: Public unauthenticated bot scraping predictions.
   - *Mitigation*: Read requires authenticated user with verified email or active account.
6. **Payload 6 (Oversized Prompt Denial of Wallet in Video Gen)**: Attacker sends 1MB prompt.
   - *Mitigation*: String length constrained to `<= 1000`.
7. **Payload 7 (Video Gen Impersonation)**: User sends `userId: "other_user"`.
   - *Mitigation*: Enforce `request.resource.data.userId == request.auth.uid`.
8. **Payload 8 (Invalid Aspect Ratio)**: Sending `aspectRatio: "4:3"`.
   - *Mitigation*: Enum validation enforces `['16:9', '9:16']`.
9. **Payload 9 (Sync Job Tampering)**: Regular user injecting synthetic successful sync jobs.
   - *Mitigation*: Write requires `isAdmin()`.
10. **Payload 10 (Delete Other Users' Video Generations)**: Regular user deletes another user's generation.
    - *Mitigation*: Delete requires `resource.data.userId == request.auth.uid || isAdmin()`.
11. **Payload 11 (Oversized Document ID Injection)**: Sending 2KB ID string to bypass index buffers.
    - *Mitigation*: `isValidId(id)` checks string size `<= 128` and regex `^[a-zA-Z0-9_\\-]+$`.
12. **Payload 12 (Query Poisoning / Scraping all users)**: Running a blank collection query on `/users`.
    - *Mitigation*: `allow list` requires admin or single document access by user ID.
