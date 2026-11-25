<script lang="ts">
    import { page } from '$app/state';
    import UploadIcon from '@lucide/svelte/icons/upload';
    import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
    import LinkIcon from '@lucide/svelte/icons/link';
    import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
    import TrashIcon from '@lucide/svelte/icons/trash-2';
    import FileLockIcon from '@lucide/svelte/icons/file-lock';
    import Avatar from '#lib/components/avatar.svelte';
    import UploadForm from '#lib/components/upload-form.svelte';
    import { Badge } from '#lib/components/ui/badge/index.js';
    import { Button } from '#lib/components/ui/button/index.js';
    import * as Card from '#lib/components/ui/card/index.js';
    import * as Dialog from '#lib/components/ui/dialog/index.js';
    import * as Empty from '#lib/components/ui/empty/index.js';
    import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
    import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';
    import * as Table from '#lib/components/ui/table/index.js';
    import { formatBytes, formatDate, formatRelative } from '#lib/format.js';
    import type { PageProps } from './$types';

    type ShareRow = {
        id: string;
        ownerId?: string;
        size: number;
        createdAt: string;
        expiresAt: string;
        downloads: number;
        maxDownloads: number | null;
    };

    const MAX_ACTIVE = 50;
    const DAY = 86_400_000;

    let { data }: PageProps = $props();

    let rows = $state<ShareRow[]>([]);
    let scope = $state<'mine' | 'all'>('mine');
    let loaded = $state(false);
    let error = $state('');
    let uploadOpen = $state(false);
    let uploadKey = $state(0);
    let copied = $state('');

    const isSuperadmin = $derived(data.user.role === 'superadmin');
    const mine = $derived(rows.filter((r) => !r.ownerId || r.ownerId === data.user.id));
    const stats = $derived({
        active: mine.length,
        bytes: rows.reduce((sum, r) => sum + r.size, 0),
        downloads: rows.reduce((sum, r) => sum + r.downloads, 0),
        expiringSoon: rows.filter((r) => new Date(r.expiresAt).getTime() - Date.now() < DAY).length
    });

    const load = async () => {
        const res = await fetch(`/api/shares${scope === 'all' ? '?all=1' : ''}`);
        if (!res.ok) {
            error = 'Could not load files';
            return;
        }
        error = '';
        rows = (await res.json()).shares;
        loaded = true;
    };

    $effect(() => {
        void scope;
        load();
    });

    const link = (id: string) => `${page.url.origin}/f/${id}`;

    const copy = async (id: string) => {
        await navigator.clipboard.writeText(link(id));
        copied = id;
        setTimeout(() => (copied = copied === id ? '' : copied), 2000);
    };

    const remove = async (id: string) => {
        if (!confirm('Delete this file? Its link stops working immediately.')) return;
        const res = await fetch(`/api/shares/${id}`, { method: 'DELETE' });
        if (!res.ok) error = 'Could not delete that file';
        await load();
    };

    const openUpload = () => {
        uploadKey++;
        uploadOpen = true;
    };
</script>

<svelte:head>
    <title>Files · onecrab</title>
</svelte:head>

<div class="mx-auto max-w-6xl space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="space-y-1">
            <h1 class="text-2xl font-semibold tracking-tight">Files</h1>
            <p class="text-muted-foreground text-sm">
                Shares are encrypted with their passcode, so names stay hidden until someone unlocks them.
            </p>
        </div>
        <div class="flex items-center gap-2">
            {#if isSuperadmin}
                <div class="bg-muted flex rounded-full p-1 text-sm">
                    <button
                        class="rounded-full px-3 py-1 {scope === 'mine' ? 'bg-background shadow-sm' : 'text-muted-foreground'}"
                        onclick={() => (scope = 'mine')}>Mine</button
                    >
                    <button
                        class="rounded-full px-3 py-1 {scope === 'all' ? 'bg-background shadow-sm' : 'text-muted-foreground'}"
                        onclick={() => (scope = 'all')}>All users</button
                    >
                </div>
            {/if}
            <Button onclick={openUpload} disabled={stats.active >= MAX_ACTIVE}>
                <UploadIcon />
                Upload
            </Button>
        </div>
    </div>

    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card.Root>
            <Card.Header>
                <Card.Description>Active files</Card.Description>
                <Card.Title class="text-2xl tabular-nums">
                    {stats.active}<span class="text-muted-foreground text-base font-normal"> / {MAX_ACTIVE}</span>
                </Card.Title>
            </Card.Header>
        </Card.Root>
        <Card.Root>
            <Card.Header>
                <Card.Description>Storage used</Card.Description>
                <Card.Title class="text-2xl tabular-nums">{formatBytes(stats.bytes)}</Card.Title>
            </Card.Header>
        </Card.Root>
        <Card.Root>
            <Card.Header>
                <Card.Description>Downloads</Card.Description>
                <Card.Title class="text-2xl tabular-nums">{stats.downloads}</Card.Title>
            </Card.Header>
        </Card.Root>
        <Card.Root>
            <Card.Header>
                <Card.Description>Expiring within 24h</Card.Description>
                <Card.Title class="text-2xl tabular-nums">{stats.expiringSoon}</Card.Title>
            </Card.Header>
        </Card.Root>
    </div>

    {#if error}
        <p class="text-destructive text-sm">{error}</p>
    {/if}

    <Card.Root class="overflow-hidden py-0">
        {#if loaded && rows.length === 0}
            <Empty.Root>
                <Empty.Header>
                    <Empty.Media variant="icon"><FileLockIcon /></Empty.Media>
                    <Empty.Title>No active files</Empty.Title>
                    <Empty.Description>Upload a file to get a link and passcode to share.</Empty.Description>
                </Empty.Header>
                <Empty.Content>
                    <Button variant="outline" onclick={openUpload}><UploadIcon />Upload a file</Button>
                </Empty.Content>
            </Empty.Root>
        {:else}
            <ScrollArea orientation="horizontal">

                <Table.Root>
                <Table.Header>
                    <Table.Row>
                        {#if scope === 'all'}<Table.Head class="w-12 pl-4">Owner</Table.Head>{/if}
                        <Table.Head class={scope === 'all' ? '' : 'pl-4'}>Uploaded</Table.Head>
                        <Table.Head>Size</Table.Head>
                        <Table.Head>Expires</Table.Head>
                        <Table.Head>Downloads</Table.Head>
                        <Table.Head class="w-12 pr-4"><span class="sr-only">Actions</span></Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#each rows as row (row.id)}
                        {@const soon = new Date(row.expiresAt).getTime() - Date.now() < DAY}
                        <Table.Row>
                            {#if scope === 'all'}
                                <Table.Cell class="pl-4">
                                    {#if row.ownerId}<Avatar userId={row.ownerId} size={24} />{/if}
                                </Table.Cell>
                            {/if}
                            <Table.Cell class={scope === 'all' ? '' : 'pl-4'}>
                                <div class="font-medium">{formatDate(row.createdAt)}</div>
                                <div class="text-muted-foreground font-mono text-xs">{row.id}</div>
                            </Table.Cell>
                            <Table.Cell class="tabular-nums">{formatBytes(row.size)}</Table.Cell>
                            <Table.Cell>
                                <span title={formatDate(row.expiresAt)}>
                                    {#if soon}
                                        <Badge variant="destructive">{formatRelative(row.expiresAt)}</Badge>
                                    {:else}
                                        {formatRelative(row.expiresAt)}
                                    {/if}
                                </span>
                            </Table.Cell>
                            <Table.Cell class="tabular-nums">
                                {row.downloads}{#if row.maxDownloads != null}<span class="text-muted-foreground">
                                        / {row.maxDownloads}</span
                                    >{/if}
                            </Table.Cell>
                            <Table.Cell class="pr-4 text-right">
                                <DropdownMenu.Root>
                                    <DropdownMenu.Trigger>
                                        {#snippet child({ props })}
                                            <Button variant="ghost" size="icon" aria-label="Actions" {...props}>
                                                <EllipsisIcon />
                                            </Button>
                                        {/snippet}
                                    </DropdownMenu.Trigger>
                                    <DropdownMenu.Content align="end">
                                        <DropdownMenu.Item onclick={() => copy(row.id)}>
                                            <LinkIcon />{copied === row.id ? 'Copied' : 'Copy link'}
                                        </DropdownMenu.Item>
                                        <DropdownMenu.Item onclick={() => window.open(link(row.id), '_blank')}>
                                            <ExternalLinkIcon />Open share page
                                        </DropdownMenu.Item>
                                        <DropdownMenu.Separator />
                                        <DropdownMenu.Item variant="destructive" onclick={() => remove(row.id)}>
                                            <TrashIcon />Delete
                                        </DropdownMenu.Item>
                                    </DropdownMenu.Content>
                                </DropdownMenu.Root>
                            </Table.Cell>
                        </Table.Row>
                    {/each}
                </Table.Body>
                </Table.Root>

            </ScrollArea>
        {/if}
    </Card.Root>
</div>

<Dialog.Root bind:open={uploadOpen}>
    <!-- Top-anchored so the dialog doesn't jump when the form swaps to the taller result view. -->
    <Dialog.Content class="top-[10vh] translate-y-0 sm:max-w-md">
        <Dialog.Header>
            <Dialog.Title>Upload a file</Dialog.Title>
            <Dialog.Description>Up to 5 MB, encrypted with a passcode only you and your recipient know.</Dialog.Description>
        </Dialog.Header>
        {#key uploadKey}
            <UploadForm onuploaded={load} ondone={() => (uploadOpen = false)} />
        {/key}
    </Dialog.Content>
</Dialog.Root>
