# passkey host

static files served at the passkey rpId (pehra.trade, or a vercel subdomain until the domain exists). android reads `.well-known/assetlinks.json`, ios reads `.well-known/apple-app-site-association`. the android fingerprint listed is the local debug keystore on mintu's mac; add the release keystore and the play app signing cert before a store build. ios needs the apple team id filled in.

deploy: `cd web/passkeys && vercel --prod`
