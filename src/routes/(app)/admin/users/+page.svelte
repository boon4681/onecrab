<script lang="ts">
    import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
    import TrashIcon from '@lucide/svelte/icons/trash-2';
    import UsersIcon from '@lucide/svelte/icons/users';
    import Avatar from '#lib/components/avatar.svelte';
    import ProviderIcon from '#lib/components/provider-icon.svelte';
    import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
    import { Badge } from '#lib/components/ui/badge/index.js';
    import { Button } from '#lib/components/ui/button/index.js';
    import * as Card from '#lib/components/ui/card/index.js';
    import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
    import * as Empty from '#lib/components/ui/empty/index.js';
    import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';
    import * as Table from '#lib/components/ui/table/index.js';
    import { formatBytes, formatDate } from '#lib/format.js';

    type ProviderType = 'google' | 'github' | 'oidc';
    type UserRow = {
        id: string;
        email: string;
        role: 'superadmin' | 'user';
        createdAt: string;
        providers: ProviderType[];
        shareCount: number;
        totalBytes: number;
    };

    let users = $state<UserRow[]>([]);
    let loaded = $state(false);
    let error = $state('');
    let target = $state<UserRow | null>(null);
    let busy = $state(false);

    const load = async () => {
        const res = await fetch('/api/users');
        if (!res.ok) {
            error = 'Could not load users';
            return;
        }
        users = (await res.json()).users;
        loaded = true;
    };

    $effect(() => {
        load();
    });

    const confirmRemove = async () => {
        if (!target) return;
        busy = true;
        const res = await fetch(`/api/users/${target.id}`, { method: 'DELETE' });
        busy = false;
        if (res.ok) {
            users = (await res.json()).users;
            error = '';
        } else {
            error = 'Could not remove that user';
        }
        target = null;
    };
</script>

<svelte:head>
    <title>Users · onecrab</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6">
    <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">Users</h1>
        <p class="text-muted-foreground text-sm">Everyone who has signed in. Removing a user deletes their files.</p>
    </div>

    {#if error}
        <p class="text-destructive text-sm">{error}</p>
    {/if}

    <Card.Root class="overflow-hidden py-0">
        {#if loaded && users.length === 0}
            <Empty.Root>
                <Empty.Header>
                    <Empty.Media variant="icon"><UsersIcon /></Empty.Media>
                    <Empty.Title>No users yet</Empty.Title>
                    <Empty.Description>Invited people appear here after their first sign-in.</Empty.Description>
                </Empty.Header>
            </Empty.Root>
        {:else}
            <ScrollArea orientation="horizontal">

                <Table.Root>
                <Table.Header>
                    <Table.Row>
                        <Table.Head class="pl-4">User</Table.Head>
                        <Table.Head>Role</Table.Head>
                        <Table.Head>Sign-in</Table.Head>
                        <Table.Head>Files</Table.Head>
                        <Table.Head>Joined</Table.Head>
                        <Table.Head class="w-12 pr-4"><span class="sr-only">Actions</span></Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#each users as user (user.id)}
                        <Table.Row>
                            <Table.Cell class="pl-4">
                                <div class="flex items-center gap-2 pr-4">
                                    <Avatar userId={user.id} size={24} />
                                    <span class="max-w-64 truncate font-medium" title={user.email}>{user.email}</span>
                                </div>
                            </Table.Cell>
                            <Table.Cell>
                                <Badge variant={user.role === 'superadmin' ? 'default' : 'outline'} class="capitalize">
                                    {user.role}
                                </Badge>
                            </Table.Cell>
                            <Table.Cell>
                                <div class="flex items-center gap-2 [&_svg]:size-4">
                                    {#each user.providers as type (type)}
                                        <span title={type}><ProviderIcon {type} /></span>
                                    {:else}
                                        <span class="text-muted-foreground">Password</span>
                                    {/each}
                                </div>
                            </Table.Cell>
                            <Table.Cell class="tabular-nums">
                                {user.shareCount}
                                <span class="text-muted-foreground">· {formatBytes(user.totalBytes)}</span>
                            </Table.Cell>
                            <Table.Cell class="text-muted-foreground">{formatDate(user.createdAt)}</Table.Cell>
                            <Table.Cell class="pr-4 text-right">
                                {#if user.role !== 'superadmin'}
                                    <DropdownMenu.Root>
                                        <DropdownMenu.Trigger>
                                            {#snippet child({ props })}
                                                <Button variant="ghost" size="icon" aria-label="Actions for {user.email}" {...props}>
                                                    <EllipsisIcon />
                                                </Button>
                                            {/snippet}
                                        </DropdownMenu.Trigger>
                                        <DropdownMenu.Content align="end">
                                            <DropdownMenu.Item variant="destructive" onclick={() => (target = user)}>
                                                <TrashIcon />Remove
                                            </DropdownMenu.Item>
                                        </DropdownMenu.Content>
                                    </DropdownMenu.Root>
                                {/if}
                            </Table.Cell>
                        </Table.Row>
                    {/each}
                </Table.Body>
                </Table.Root>

            </ScrollArea>
        {/if}
    </Card.Root>
</div>

<AlertDialog.Root open={!!target} onOpenChange={(open) => !open && (target = null)}>
    <AlertDialog.Content>
        <AlertDialog.Header>
            <AlertDialog.Title>Remove {target?.email}?</AlertDialog.Title>
            <AlertDialog.Description>
                They are signed out everywhere, their files and share links are deleted, and their invite is removed so
                they cannot sign in again. This cannot be undone.
            </AlertDialog.Description>
        </AlertDialog.Header>
        <AlertDialog.Footer>
            <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
            <AlertDialog.Action variant="destructive" disabled={busy} onclick={confirmRemove}>Remove user</AlertDialog.Action>
        </AlertDialog.Footer>
    </AlertDialog.Content>
</AlertDialog.Root>
