<script lang="ts">
    import MailPlusIcon from '@lucide/svelte/icons/mail-plus';
    import TrashIcon from '@lucide/svelte/icons/trash-2';
    import { Badge } from '#lib/components/ui/badge/index.js';
    import { Button } from '#lib/components/ui/button/index.js';
    import * as Card from '#lib/components/ui/card/index.js';
    import * as Empty from '#lib/components/ui/empty/index.js';
    import * as Field from '#lib/components/ui/field/index.js';
    import { Input } from '#lib/components/ui/input/index.js';
    import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';
    import * as Table from '#lib/components/ui/table/index.js';
    import Avatar from '#lib/components/avatar.svelte';
    import { formatDate } from '#lib/format.js';

    type Invite = { email: string; createdAt: string; joined: boolean; userId: string | null };

    let invites = $state<Invite[]>([]);
    let loaded = $state(false);
    let email = $state('');
    let error = $state('');
    let busy = $state(false);

    const load = async () => {
        const res = await fetch('/api/invites');
        if (res.ok) invites = (await res.json()).invites;
        loaded = true;
    };

    $effect(() => {
        load();
    });

    const add = async (e: SubmitEvent) => {
        e.preventDefault();
        error = '';
        busy = true;
        const res = await fetch('/api/invites', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json().catch(() => ({}));
        busy = false;
        if (!res.ok) {
            error = data.error ?? 'Could not add invite';
            return;
        }
        invites = data.invites;
        email = '';
    };

    const remove = async (invite: Invite) => {
        const note = invite.joined ? ' They will no longer be able to sign in.' : '';
        if (!confirm(`Remove the invite for ${invite.email}?${note}`)) return;
        const res = await fetch(`/api/invites/${encodeURIComponent(invite.email)}`, { method: 'DELETE' });
        if (res.ok) invites = (await res.json()).invites;
    };
</script>

<svelte:head>
    <title>Invites · onecrab</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
    <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">Invites</h1>
        <p class="text-muted-foreground text-sm">
            Only invited emails can sign in. The provider must report the email as verified.
        </p>
    </div>

    <Card.Root>
        <Card.Content>
            <form onsubmit={add}>
                <Field.Field data-invalid={!!error || undefined}>
                    <Field.Label for="invite-email">Invite by email</Field.Label>
                    <div class="flex gap-2">
                        <Input
                            id="invite-email"
                            type="email"
                            placeholder="name@example.com"
                            required
                            aria-invalid={!!error || undefined}
                            bind:value={email}
                        />
                        <Button type="submit" disabled={busy}><MailPlusIcon />Invite</Button>
                    </div>
                    {#if error}<Field.Error>{error}</Field.Error>{/if}
                </Field.Field>
            </form>
        </Card.Content>
    </Card.Root>

    <Card.Root class="overflow-hidden py-0">
        {#if loaded && invites.length === 0}
            <Empty.Root>
                <Empty.Header>
                    <Empty.Media variant="icon"><MailPlusIcon /></Empty.Media>
                    <Empty.Title>No invites yet</Empty.Title>
                    <Empty.Description>Invite someone by email to let them sign in.</Empty.Description>
                </Empty.Header>
            </Empty.Root>
        {:else}
            <ScrollArea orientation="horizontal">
                <Table.Root>
                <Table.Header>
                    <Table.Row>
                        <Table.Head class="pl-4">Email</Table.Head>
                        <Table.Head>Status</Table.Head>
                        <Table.Head>Invited</Table.Head>
                        <Table.Head class="w-12 pr-4"><span class="sr-only">Actions</span></Table.Head>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {#each invites as invite (invite.email)}
                        <Table.Row>
                            <Table.Cell class="pl-4">
                                <div class="flex items-center gap-2">
                                    {#if invite.userId}<Avatar userId={invite.userId} size={24} />{/if}
                                    <span class="max-w-64 truncate font-medium" title={invite.email}>{invite.email}</span>
                                </div>
                            </Table.Cell>
                            <Table.Cell>
                                {#if invite.joined}
                                    <Badge>Joined</Badge>
                                {:else}
                                    <Badge variant="outline">Pending</Badge>
                                {/if}
                            </Table.Cell>
                            <Table.Cell class="text-muted-foreground">{formatDate(invite.createdAt)}</Table.Cell>
                            <Table.Cell class="pr-4 text-right">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Remove invite for {invite.email}"
                                    onclick={() => remove(invite)}
                                >
                                    <TrashIcon />
                                </Button>
                            </Table.Cell>
                        </Table.Row>
                    {/each}
                </Table.Body>
                </Table.Root>
            </ScrollArea>
        {/if}
    </Card.Root>
</div>
