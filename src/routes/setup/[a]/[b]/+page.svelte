<script lang="ts">
    import Logo from '#lib/components/logo.svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { postJson } from '#lib/api.js';
    import { Button } from '#lib/components/ui/button/index.js';
    import * as Card from '#lib/components/ui/card/index.js';
    import * as Alert from '#lib/components/ui/alert/index.js';
    import { Input } from '#lib/components/ui/input/index.js';
    import { Label } from '#lib/components/ui/label/index.js';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    let email = $state('');
    let password = $state('');
    let confirm = $state('');
    let error = $state('');
    let busy = $state(false);
    let resetDone = $state(false);

    const isSetup = $derived(data.purpose === 'setup');

    const submit = async (e: SubmitEvent) => {
        e.preventDefault();
        error = '';
        if (password !== confirm) {
            error = 'Passwords do not match';
            return;
        }
        busy = true;
        const res = await postJson(`/api/setup/${page.params.a}/${page.params.b}`, { email, password });
        busy = false;
        if (!res.ok) {
            error = res.status === 404 ? 'This link is no longer valid' : res.error;
            return;
        }
        if (isSetup) await goto('/admin/settings?welcome', { invalidateAll: true });
        else resetDone = true;
    };
</script>

<svelte:head>
    <title>{isSetup ? 'Setup' : 'Reset password'} · onecrab</title>
</svelte:head>

<main class="flex min-h-svh items-center justify-center p-6">
    <Card.Root class="w-full max-w-sm">
        <Card.Header>
            <Logo size={48} class="mb-2" />
            <Card.Title>{isSetup ? 'Create superadmin' : 'Reset superadmin password'}</Card.Title>
            <Card.Description>
                {isSetup
                    ? 'This account owns onecrab and signs in with email and password.'
                    : 'Set a new password. All existing superadmin sessions will be signed out.'}
            </Card.Description>
        </Card.Header>
        <Card.Content>
            {#if resetDone}
                <p class="text-sm">Password updated. <a class="underline" href="/login">Sign in</a></p>
            {:else}
                <form class="space-y-4" onsubmit={submit}>
                    {#if isSetup}
                        <div class="space-y-2">
                            <Label for="email">Email</Label>
                            <Input id="email" type="email" autocomplete="username" required bind:value={email} />
                        </div>
                    {/if}
                    <div class="space-y-2">
                        <Label for="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            autocomplete="new-password"
                            minlength={data.minPasswordLength}
                            required
                            bind:value={password}
                        />
                        <p class="text-muted-foreground text-xs">At least {data.minPasswordLength} characters.</p>
                    </div>
                    <div class="space-y-2">
                        <Label for="confirm">Confirm password</Label>
                        <Input id="confirm" type="password" autocomplete="new-password" required bind:value={confirm} />
                    </div>
                    {#if error}
                        <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
                    {/if}
                    <Button type="submit" class="w-full" disabled={busy}>
                        {isSetup ? 'Create superadmin' : 'Set password'}
                    </Button>
                </form>
            {/if}
        </Card.Content>
    </Card.Root>
</main>
