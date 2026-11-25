<script lang="ts" module>
    export type AdminProvider = {
        type: 'google' | 'github' | 'oidc';
        defaultName: string;
        callbackUrl: string;
        configured: boolean;
        clientId: string;
        hasSecret: boolean;
        authorizationUrl: string;
        tokenUrl: string;
        userinfoUrl: string;
        scopes: string;
        usePkce: boolean;
        displayName: string;
        trustEmail: boolean;
        enabled: boolean;
        lastTestOk: boolean | null;
        lastTestMessage: string | null;
        lastTestedAt: string | Date | null;
    };
</script>

<script lang="ts">
    import { untrack } from 'svelte';
    import { Button } from '#lib/components/ui/button/index.js';
    import * as Card from '#lib/components/ui/card/index.js';
    import * as Alert from '#lib/components/ui/alert/index.js';
    import { Input } from '#lib/components/ui/input/index.js';
    import { Label } from '#lib/components/ui/label/index.js';
    import * as Field from '#lib/components/ui/field/index.js';
    import { Switch } from '#lib/components/ui/switch/index.js';

    let { provider: initial }: { provider: AdminProvider } = $props();

    // The card owns its copy after mount; fresh server state arrives through API responses.
    const start = untrack(() => ({ ...initial }));
    let provider = $state<AdminProvider>(start);
    let clientId = $state(start.clientId);
    let clientSecret = $state('');
    let authorizationUrl = $state(start.authorizationUrl);
    let tokenUrl = $state(start.tokenUrl);
    let userinfoUrl = $state(start.userinfoUrl);
    let scopes = $state(start.scopes);
    let usePkce = $state(start.usePkce);
    let displayName = $state(start.displayName);
    let trustEmail = $state(start.trustEmail);
    let busy = $state('');
    let error = $state('');
    let copied = $state(false);

    const id = (field: string) => `${provider.type}-${field}`;

    const call = async (label: string, url: string, init: RequestInit) => {
        error = '';
        busy = label;
        const res = await fetch(url, { headers: { 'content-type': 'application/json' }, ...init });
        const data = await res.json().catch(() => ({}));
        busy = '';
        if (!res.ok) {
            error = data.error ?? 'Request failed';
            return;
        }
        provider = data.provider;
        clientSecret = '';
    };

    const save = (e: SubmitEvent) => {
        e.preventDefault();
        return call('save', `/api/providers/${provider.type}`, {
            method: 'PUT',
            body: JSON.stringify({
                clientId,
                clientSecret,
                authorizationUrl,
                tokenUrl,
                userinfoUrl,
                scopes,
                usePkce,
                displayName,
                trustEmail
            })
        });
    };

    const test = () => call('test', `/api/providers/${provider.type}/test`, { method: 'POST' });

    const remove = async () => {
        if (!confirm(`Remove ${provider.defaultName} configuration?`)) return;
        await call('remove', `/api/providers/${provider.type}`, { method: 'DELETE' });
        clientId = '';
        authorizationUrl = '';
        tokenUrl = '';
        userinfoUrl = '';
        displayName = '';
    };

    let popupResult = $state<{ ok: boolean; message: string } | null>(null);

    const tryPopup = () => {
        popupResult = null;
        const onMessage = (e: MessageEvent) => {
            if (e.origin !== location.origin || e.data?.source !== 'onecrab-provider-test') return;
            popupResult = { ok: e.data.ok, message: e.data.message };
            window.removeEventListener('message', onMessage);
            refresh();
        };
        window.addEventListener('message', onMessage);
        window.open(`/api/auth/signin/${provider.type}?test=1`, 'onecrab-provider-test', 'width=520,height=680');
    };

    // The popup's sign-in may have enabled the provider server-side.
    const refresh = async () => {
        const res = await fetch('/api/providers');
        if (!res.ok) return;
        const fresh = (await res.json()).providers.find((p: AdminProvider) => p.type === provider.type);
        if (fresh) provider = fresh;
    };

    const copyCallback = async () => {
        await navigator.clipboard.writeText(provider.callbackUrl);
        copied = true;
    };
</script>

<Card.Root>
    <Card.Header>
        <div class="flex items-center justify-between gap-2">
            <Card.Title>{provider.defaultName}</Card.Title>
            {#if !provider.configured}
                <span class="text-muted-foreground text-xs">Not configured</span>
            {:else if provider.enabled}
                <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">Enabled</span>
            {:else}
                <span class="bg-destructive/15 text-destructive rounded-full px-2 py-0.5 text-xs">Disabled</span>
            {/if}
        </div>
        <Card.Description>
            {provider.type === 'oidc' ? 'Any OAuth2 / OpenID Connect server, configured with its endpoints.' : `Sign in with ${provider.defaultName}.`}
            Users still need an invite.
        </Card.Description>
    </Card.Header>
    <Card.Content>
        <form class="space-y-4" onsubmit={save}>
            <div class="space-y-2">
                <Label for={id('callback')}>Callback URL</Label>
                <div class="flex gap-2">
                    <Input id={id('callback')} readonly value={provider.callbackUrl} class="font-mono text-xs" />
                    <Button type="button" variant="outline" onclick={copyCallback}>{copied ? 'Copied' : 'Copy'}</Button>
                </div>
                <p class="text-muted-foreground text-xs">Register this exact URL with the provider.</p>
            </div>
            {#if provider.type === 'oidc'}
                <div class="space-y-2">
                    <Label for={id('authorization-url')}>Authorization URL</Label>
                    <Input
                        id={id('authorization-url')}
                        type="url"
                        placeholder="https://auth.example.com/oauth/authorize"
                        required
                        bind:value={authorizationUrl}
                    />
                </div>
                <div class="space-y-2">
                    <Label for={id('token-url')}>Token URL</Label>
                    <Input
                        id={id('token-url')}
                        type="url"
                        placeholder="https://auth.example.com/oauth/token"
                        required
                        bind:value={tokenUrl}
                    />
                </div>
                <div class="space-y-2">
                    <Label for={id('userinfo-url')}>User info URL</Label>
                    <Input
                        id={id('userinfo-url')}
                        type="url"
                        placeholder="https://auth.example.com/oauth/userinfo"
                        required
                        bind:value={userinfoUrl}
                    />
                    <p class="text-muted-foreground text-xs">Must return JSON with <code>sub</code> or <code>id</code>, and <code>email</code>.</p>
                </div>
                <div class="space-y-2">
                    <Label for={id('scopes')}>Scopes</Label>
                    <Input id={id('scopes')} placeholder="openid email profile" bind:value={scopes} />
                    <p class="text-muted-foreground text-xs">Space-separated. Leave empty for <code>openid email profile</code>.</p>
                </div>
                <Field.Field orientation="horizontal">
                    <Field.Content>
                        <Field.Label for={id('pkce')}>Use PKCE</Field.Label>
                        <Field.Description>
                            Extra protection for the login code. Turn off if the provider fails with PKCE parameters.
                        </Field.Description>
                    </Field.Content>
                    <Switch id={id('pkce')} bind:checked={usePkce} />
                </Field.Field>
                <div class="space-y-2">
                    <Label for={id('name')}>Button label</Label>
                    <Input id={id('name')} placeholder="OIDC" bind:value={displayName} />
                </div>
                <Field.Field orientation="horizontal">
                    <Field.Content>
                        <Field.Label for={id('trust-email')}>Trust emails from this provider</Field.Label>
                        <Field.Description>
                            Treat every email it returns as verified, even without an email_verified field. Only turn
                            this on for providers that hand out addresses they own, like a university or company IdP.
                        </Field.Description>
                    </Field.Content>
                    <Switch id={id('trust-email')} bind:checked={trustEmail} />
                </Field.Field>
            {/if}
            <div class="space-y-2">
                <Label for={id('client-id')}>Client ID</Label>
                <Input id={id('client-id')} autocomplete="off" required bind:value={clientId} />
            </div>
            <div class="space-y-2">
                <Label for={id('client-secret')}>Client secret</Label>
                <Input
                    id={id('client-secret')}
                    type="password"
                    autocomplete="off"
                    placeholder={provider.hasSecret ? 'Unchanged' : ''}
                    required={!provider.hasSecret}
                    bind:value={clientSecret}
                />
            </div>
            {#if provider.lastTestMessage}
                <Alert.Root variant={provider.lastTestOk ? 'default' : 'destructive'}>
                    <Alert.Description>Last test: {provider.lastTestMessage}</Alert.Description>
                </Alert.Root>
            {/if}
            {#if popupResult}
                <Alert.Root variant={popupResult.ok ? 'default' : 'destructive'}>
                    <Alert.Description>Try sign-in: {popupResult.message}</Alert.Description>
                </Alert.Root>
            {/if}
            {#if error}
                <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
            {/if}
            <div class="flex flex-wrap gap-2">
                <Button type="submit" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save and test'}</Button>
                {#if provider.configured}
                    <Button type="button" variant="outline" disabled={!!busy} onclick={test}>
                        {busy === 'test' ? 'Testing…' : 'Test again'}
                    </Button>
                    <Button type="button" variant="outline" disabled={!!busy} onclick={tryPopup}>
                        Try sign-in
                    </Button>
                    <Button type="button" variant="destructive" disabled={!!busy} onclick={remove}>Remove</Button>
                {/if}
            </div>
        </form>
    </Card.Content>
</Card.Root>
