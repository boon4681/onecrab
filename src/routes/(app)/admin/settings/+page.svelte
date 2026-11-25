<script lang="ts">
    import Logo from '#lib/components/logo.svelte';
    import ProviderCard from '#lib/components/provider-card.svelte';
    import { Button } from '#lib/components/ui/button/index.js';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();
</script>

<svelte:head>
    <title>Settings · onecrab</title>
</svelte:head>

<main class="mx-auto max-w-2xl space-y-6 p-6">
    <header class="flex items-center justify-between gap-4">
        <a href="/" class="flex items-center gap-2"><Logo size={32} /><span class="font-semibold">onecrab</span></a>
        {#if data.welcome}
            <Button href="/" variant="outline" size="sm">Skip for now</Button>
        {:else}
            <Button href="/" variant="outline" size="sm">Back</Button>
        {/if}
    </header>
    <div class="space-y-1">
        {#if data.welcome}
            <p class="text-muted-foreground text-xs uppercase tracking-wide">Setup · step 2 of 2 (optional)</p>
        {/if}
        <h1 class="text-2xl font-semibold">Sign-in providers</h1>
        <p class="text-muted-foreground text-sm">
            Invited users sign in with these. A provider is enabled only after its credentials pass a test, and editing
            them disables it until they pass again. You can configure providers later from here.
        </p>
    </div>
    {#each data.providers as provider (provider.type)}
        <ProviderCard {provider} />
    {/each}
</main>
