<script lang="ts">
    import { page } from '$app/state';
    import { Button } from '#lib/components/ui/button/index.js';
    import * as Alert from '#lib/components/ui/alert/index.js';
    import { Input } from '#lib/components/ui/input/index.js';
    import { Label } from '#lib/components/ui/label/index.js';
    import * as Field from '#lib/components/ui/field/index.js';
    import * as Select from '#lib/components/ui/select/index.js';
    import { Switch } from '#lib/components/ui/switch/index.js';
    import FileDropzone from '#lib/components/file-dropzone.svelte';
    import { formatBytes } from '#lib/format.js';
    import PasscodeInput from '#lib/components/passcode-input.svelte';
    import CopyIcon from '@lucide/svelte/icons/copy';
    import CheckIcon from '@lucide/svelte/icons/check';

    let { onuploaded, ondone }: { onuploaded?: () => void; ondone?: () => void } = $props();

    const MAX_BYTES = 5 * 1024 * 1024;
    const TTL_OPTIONS = [
        { value: '1h', label: '1 hour' },
        { value: '1d', label: '1 day' },
        { value: '7d', label: '7 days' },
        { value: '30d', label: '30 days' }
    ];
    const PASSCODE_RE = /^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{6,64}$/;

    let file = $state<File | null>(null);
    let customPasscode = $state(false);
    let passcode = $state('');
    let ttl = $state('7d');
    let maxDownloads = $state('');
    let error = $state('');
    let busy = $state(false);
    let result = $state<{ url: string; passcode: string } | null>(null);
    let copied = $state('');

    const tooBig = $derived(!!file && file.size > MAX_BYTES);
    const passcodeOk = $derived(PASSCODE_RE.test(passcode));
    const ttlLabel = $derived(TTL_OPTIONS.find((o) => o.value === ttl)?.label ?? 'Choose');

    const submit = async (e: SubmitEvent) => {
        e.preventDefault();
        if (!file || tooBig) return;
        error = '';
        busy = true;
        const body = new FormData();
        body.set('file', file);
        if (customPasscode) body.set('passcode', passcode);
        body.set('ttl', ttl);
        if (maxDownloads) body.set('maxDownloads', maxDownloads);
        const res = await fetch('/api/shares', { method: 'POST', body });
        const data = await res.json().catch(() => ({}));
        busy = false;
        if (!res.ok) {
            error = data.error ?? 'Upload failed';
            return;
        }
        onuploaded?.();
        result = { url: `${page.url.origin}/f/${data.id}`, passcode: data.passcode };
    };

    const copy = async (label: string, text: string) => {
        await navigator.clipboard.writeText(text);
        copied = label;
    };

    const reset = () => {
        file = null;
        passcode = '';
        maxDownloads = '';
        customPasscode = false;
        result = null;
        copied = '';
    };
</script>

<div class="min-w-0">
        {#if result}
            <div class="space-y-4">
                <Alert.Root>
                    <Alert.Description>
                        Save the passcode now. It is not stored and cannot be shown again.
                    </Alert.Description>
                </Alert.Root>
                <div class="space-y-2">
                    <Label>Link</Label>
                    <div class="flex gap-2">
                        <Input readonly value={result.url} class="min-w-0 font-mono text-xs" />
                        <Button
                            variant="outline"
                            size="icon"
                            class="shrink-0"
                            aria-label="Copy link"
                            onclick={() => copy('link', result!.url)}
                        >
                            {#if copied === 'link'}<CheckIcon />{:else}<CopyIcon />{/if}
                        </Button>
                    </div>
                </div>
                <div class="space-y-2">
                    <Label>Passcode</Label>
                    <div class="flex items-center justify-between gap-2">
                        <PasscodeInput readonly size="sm" value={result.passcode} />
                        <Button
                            variant="outline"
                            size="icon"
                            class="shrink-0"
                            aria-label="Copy passcode"
                            onclick={() => copy('passcode', result!.passcode)}
                        >
                            {#if copied === 'passcode'}<CheckIcon />{:else}<CopyIcon />{/if}
                        </Button>
                    </div>
                </div>
                <Button
                    variant="outline"
                    class="w-full"
                    onclick={() => copy('both', `${result!.url}\nPasscode: ${result!.passcode}`)}
                >
                    {#if copied === 'both'}<CheckIcon />{:else}<CopyIcon />{/if}
                    Copy link and passcode
                </Button>
                <div class="flex gap-2">
                    <Button variant="secondary" class="flex-1" onclick={reset}>Share another file</Button>
                    {#if ondone}<Button class="flex-1" onclick={ondone}>Done</Button>{/if}
                </div>
            </div>
        {:else}
            <form onsubmit={submit}>
                <Field.Group>
                    <Field.Field>
                        <Field.Label for="file">File</Field.Label>
                        <FileDropzone bind:file maxBytes={MAX_BYTES} uploading={busy} />
                    </Field.Field>
                    <Field.Field orientation="horizontal">
                        <Field.Content>
                            <Field.Label for="custom-passcode">Choose my own passcode</Field.Label>
                            <Field.Description>
                                {customPasscode
                                    ? 'At least 6 letters or digits, with at least one of each.'
                                    : 'Otherwise a 6-character passcode is generated for you.'}
                            </Field.Description>
                        </Field.Content>
                        <Switch id="custom-passcode" bind:checked={customPasscode} />
                    </Field.Field>
                    {#if customPasscode}
                        <Field.Field>
                            <PasscodeInput
                                id="passcode"
                                size="sm"
                                bind:value={passcode}
                                invalid={passcode.length >= 6 && !passcodeOk}
                            />
                        </Field.Field>
                    {/if}
                    <div class="grid grid-cols-2 gap-4">
                        <Field.Field>
                            <Field.Label for="ttl">Expires after</Field.Label>
                            <Select.Root type="single" bind:value={ttl} items={TTL_OPTIONS}>
                                <Select.Trigger id="ttl" class="w-full">{ttlLabel}</Select.Trigger>
                                <Select.Content>
                                    {#each TTL_OPTIONS as option (option.value)}
                                        <Select.Item value={option.value} label={option.label} />
                                    {/each}
                                </Select.Content>
                            </Select.Root>
                        </Field.Field>
                        <Field.Field>
                            <Field.Label for="maxDownloads">Max downloads</Field.Label>
                            <Input
                                id="maxDownloads"
                                type="number"
                                inputmode="numeric"
                                min={1}
                                max={1000}
                                step={1}
                                placeholder="Unlimited"
                                bind:value={maxDownloads}
                            />
                        </Field.Field>
                    </div>
                    {#if error}
                        <Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>
                    {/if}
                    <Button type="submit" class="w-full" disabled={busy || !file || tooBig || (customPasscode && !passcodeOk)}>
                        {busy ? 'Encrypting…' : 'Upload'}
                    </Button>
                </Field.Group>
            </form>
        {/if}
</div>
