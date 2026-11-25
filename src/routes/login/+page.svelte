<script lang="ts">
    import { goto } from '$app/navigation';
    import Logo from '#lib/components/logo.svelte';
    import ProviderIcon from '#lib/components/provider-icon.svelte';
    import { postJson } from '#lib/api.js';
    import { tooManyAttemptsMessage } from '#lib/format.js';
    import { Button } from '#lib/components/ui/button/index.js';
    import * as Card from '#lib/components/ui/card/index.js';
    import * as Alert from '#lib/components/ui/alert/index.js';
    import * as Field from '#lib/components/ui/field/index.js';
    import { Input } from '#lib/components/ui/input/index.js';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    let showAdmin = $state(false);
    let email = $state('');
    let password = $state('');
    let error = $state('');
    let busy = $state(false);

    const submit = async (e: SubmitEvent) => {
        e.preventDefault();
        error = '';
        busy = true;
        const res = await postJson('/api/auth/login', { email, password });
        busy = false;
        if (!res.ok) {
            error = res.status === 429 ? tooManyAttemptsMessage(res.retryAfter) : res.error;
            return;
        }
        await goto('/', { invalidateAll: true });
    };
</script>

<svelte:head>
    <title>Sign in · onecrab</title>
</svelte:head>

<main class="flex min-h-svh items-center justify-center p-6">
    <Card.Root class="w-full max-w-sm">
        <Card.Header class="items-center text-center">
            <Logo size={48} class="mx-auto mb-2 rounded-xl" />
            <Card.Title class="text-xl">Sign in to onecrab</Card.Title>
            <Card.Description>Invite only. Use the account your invite was sent to.</Card.Description>
        </Card.Header>
        <Card.Content>
            {#if showAdmin}
                <form onsubmit={submit}>
                    <Field.Group>
                        <Field.Field>
                            <Field.Label for="email">Email</Field.Label>
                            <Input id="email" type="email" autocomplete="username" required bind:value={email} />
                        </Field.Field>
                        <Field.Field>
                            <Field.Label for="password">Password</Field.Label>
                            <Input
                                id="password"
                                type="password"
                                autocomplete="current-password"
                                required
                                bind:value={password}
                            />
                        </Field.Field>
                        {#if error}
                            <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
                        {/if}
                        <Button type="submit" class="w-full" disabled={busy}>Sign in</Button>
                        <Button variant="link" size="sm" onclick={() => (showAdmin = false)}>Back</Button>
                    </Field.Group>
                </form>
            {:else}
                <Field.Group>
                    {#if data.error}
                        <Alert.Root variant="destructive"><Alert.Description>{data.error}</Alert.Description></Alert.Root>
                    {/if}
                    {#each data.providers as provider (provider.type)}
                        <Button href="/api/auth/signin/{provider.type}" variant="outline" class="w-full" data-sveltekit-reload>
                            <ProviderIcon type={provider.type} />
                            Continue with {provider.name}
                        </Button>
                    {:else}
                        <p class="text-muted-foreground text-center text-sm">No sign-in providers are enabled yet.</p>
                    {/each}
                    <Field.Separator>or</Field.Separator>
                    <Button variant="ghost" size="sm" onclick={() => (showAdmin = true)}>Admin sign-in</Button>
                </Field.Group>
            {/if}
        </Card.Content>
    </Card.Root>
</main>
