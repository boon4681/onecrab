<script lang="ts">
    import DownloadIcon from '@lucide/svelte/icons/download';
    import LockIcon from '@lucide/svelte/icons/lock-keyhole';
    import CheckIcon from '@lucide/svelte/icons/check';
    import Logo from '#lib/components/logo.svelte';
    import Avatar from '#lib/components/avatar.svelte';
    import PasscodeInput from '#lib/components/passcode-input.svelte';
    import { Button } from '#lib/components/ui/button/index.js';
    import * as Card from '#lib/components/ui/card/index.js';
    import { formatBytes, formatRelative, formatDate, tooManyAttemptsMessage } from '#lib/format.js';
    import type { PageProps } from './$types';

    let { data }: PageProps = $props();

    const MIN_LENGTH = 6;

    const description = $derived(`${formatBytes(data.size)} encrypted file. Enter the passcode to download.`);

    let passcode = $state('');
    let error = $state('');
    let invalid = $state(false);
    let busy = $state(false);
    let done = $state(false);

    $effect(() => {
        void passcode;
        invalid = false;
        error = '';
    });

    const filenameFrom = (header: string | null) => {
        const star = header?.match(/filename\*=UTF-8''([^;]+)/i);
        if (star) return decodeURIComponent(star[1]);
        return header?.match(/filename="([^"]+)"/i)?.[1] ?? 'file';
    };

    const fail = (message: string) => {
        error = message;
        // Re-adding the class on the next frame restarts the shake animation on repeated failures.
        invalid = false;
        requestAnimationFrame(() => (invalid = true));
    };

    const submit = async (e: SubmitEvent) => {
        e.preventDefault();
        if (passcode.length < MIN_LENGTH || busy) return;
        busy = true;
        const res = await fetch(`/api/shares/${data.id}/download`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ passcode })
        });
        busy = false;
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            fail(
                res.status === 404
                    ? 'This file is no longer available'
                    : res.status === 429
                      ? tooManyAttemptsMessage(body.retryAfter)
                      : res.status === 403
                        ? 'Wrong passcode'
                        : (body.error ?? 'Download failed')
            );
            return;
        }
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = filenameFrom(res.headers.get('content-disposition'));
        a.click();
        // Revoking synchronously can cancel the download in Firefox.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        done = true;
    };
</script>

<svelte:head>
    <title>Shared file · onecrab</title>
    <meta name="description" content={description} />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="onecrab" />
    <meta property="og:title" content="Someone shared a file with you" />
    <meta property="og:description" content={description} />
    <meta property="og:url" content="{data.origin}/f/{data.id}" />
    <meta property="og:image" content="{data.origin}/api/shares/{data.id}/og.png" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="onecrab: an encrypted file was shared with you" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Someone shared a file with you" />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content="{data.origin}/api/shares/{data.id}/og.png" />
</svelte:head>

<main class="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
    <Logo size={44} class="rounded-xl" />
    <Card.Root class="w-full max-w-md">
        <Card.Content class="flex flex-col items-center gap-6 py-4 text-center">
            <div class="relative">
                <Avatar userId={data.ownerId} size={64} />
                <span
                    class="bg-background absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full border"
                >
                    <LockIcon class="size-3.5" />
                </span>
            </div>
            <div class="space-y-1">
                <h1 class="text-xl font-semibold">Someone shared a file with you</h1>
                <p class="text-muted-foreground text-sm">
                    {formatBytes(data.size)} · expires
                    <span title={formatDate(data.expiresAt)}>{formatRelative(data.expiresAt)}</span>
                </p>
            </div>

            {#if done}
                <div class="flex flex-col items-center gap-3 py-2">
                    <span class="flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                        <CheckIcon class="size-6" />
                    </span>
                    <p class="text-sm">Decrypted. Your download has started.</p>
                </div>
            {:else}
                <form class="flex w-full flex-col items-center gap-5" onsubmit={submit}>
                    <div class="flex flex-col items-center gap-3">
                        <label for="passcode" class="text-muted-foreground text-sm">Enter the passcode</label>
                        <PasscodeInput id="passcode" bind:value={passcode} {invalid} autofocus />
                        <p class="h-5 text-sm {error ? 'text-destructive' : 'text-muted-foreground'}">
                            {error || 'Letters and digits, not case-sensitive'}
                        </p>
                    </div>
                    <Button type="submit" size="lg" class="w-full" disabled={busy || passcode.length < MIN_LENGTH}>
                        <DownloadIcon />
                        {busy ? 'Decrypting…' : 'Decrypt and download'}
                    </Button>
                </form>
            {/if}
        </Card.Content>
    </Card.Root>
    <p class="text-muted-foreground max-w-sm text-center text-xs">
        The file is encrypted with this passcode. onecrab never stores it, so ask the sender if you don't have it.
    </p>
</main>
