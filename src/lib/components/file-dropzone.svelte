<script lang="ts">
    import CloudUploadIcon from '@lucide/svelte/icons/cloud-upload';
    import FileIcon from '@lucide/svelte/icons/file';
    import FileWarningIcon from '@lucide/svelte/icons/file-warning';
    import XIcon from '@lucide/svelte/icons/x';
    import * as Attachment from '#lib/components/ui/attachment/index.js';
    import { Spinner } from '#lib/components/ui/spinner/index.js';
    import { formatBytes } from '#lib/format.js';

    let {
        file = $bindable(null),
        maxBytes,
        uploading = false,
        id = 'file'
    }: { file?: File | null; maxBytes: number; uploading?: boolean; id?: string } = $props();

    let dragging = $state(false);
    let input = $state<HTMLInputElement>();

    const tooBig = $derived(!!file && file.size > maxBytes);
    const attachmentState = $derived(uploading ? 'uploading' : tooBig ? 'error' : 'done');

    const pick = (e: Event) => {
        file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
    };

    const drop = (e: DragEvent) => {
        e.preventDefault();
        dragging = false;
        file = e.dataTransfer?.files?.[0] ?? file;
    };

    const clear = () => {
        file = null;
        if (input) input.value = '';
    };
</script>

{#if file}
    <Attachment.Root state={attachmentState} class="w-full">
        <Attachment.Media>
            {#if uploading}
                <Spinner />
            {:else if tooBig}
                <FileWarningIcon />
            {:else}
                <FileIcon />
            {/if}
        </Attachment.Media>
        <Attachment.Content>
            <Attachment.Title>{file.name}</Attachment.Title>
            <Attachment.Description>
                {#if uploading}
                    Encrypting and uploading…
                {:else if tooBig}
                    {formatBytes(file.size)} · over the 5 MB limit
                {:else}
                    {formatBytes(file.size)}
                {/if}
            </Attachment.Description>
        </Attachment.Content>
        <Attachment.Actions>
            <Attachment.Action aria-label="Remove file" disabled={uploading} onclick={clear}>
                <XIcon />
            </Attachment.Action>
        </Attachment.Actions>
    </Attachment.Root>
{:else}
    <Attachment.Root
        state="idle"
        class="w-full transition-colors {dragging ? 'border-primary bg-primary/5' : ''}"
        ondragover={(e: DragEvent) => {
            e.preventDefault();
            dragging = true;
        }}
        ondragleave={() => (dragging = false)}
        ondrop={drop}
    >
        <Attachment.Media><CloudUploadIcon /></Attachment.Media>
        <Attachment.Content>
            <Attachment.Title>Drop a file or click to browse</Attachment.Title>
            <Attachment.Description>Any file type, up to 5 MB</Attachment.Description>
        </Attachment.Content>
        <Attachment.Trigger aria-label="Choose a file" onclick={() => input?.click()} />
    </Attachment.Root>
{/if}
<input bind:this={input} {id} type="file" class="sr-only" tabindex="-1" onchange={pick} />
