<script lang="ts">
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import FilesIcon from '@lucide/svelte/icons/files';
    import KeyRoundIcon from '@lucide/svelte/icons/key-round';
    import MailPlusIcon from '@lucide/svelte/icons/mail-plus';
    import UsersIcon from '@lucide/svelte/icons/users';
    import LogOutIcon from '@lucide/svelte/icons/log-out';
    import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
    import { postJson } from '#lib/api.js';
    import Avatar from '#lib/components/avatar.svelte';
    import Logo from '#lib/components/logo.svelte';
    import * as Sidebar from '#lib/components/ui/sidebar/index.js';
    import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';

    type NavUser = { id: string; email: string; role: 'superadmin' | 'user' };
    let { user }: { user: NavUser } = $props();

    const main = [{ href: '/', label: 'Files', icon: FilesIcon }];
    const admin = [
        { href: '/admin/invites', label: 'Invites', icon: MailPlusIcon },
        { href: '/admin/users', label: 'Users', icon: UsersIcon },
        { href: '/admin/settings', label: 'Sign-in providers', icon: KeyRoundIcon }
    ];

    const isActive = (href: string) =>
        href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

    const logout = async () => {
        await postJson('/api/auth/logout');
        await goto('/login', { invalidateAll: true });
    };
</script>

<Sidebar.Root collapsible="icon">
    <Sidebar.Header>
        <Sidebar.Menu>
            <Sidebar.MenuItem>
                <Sidebar.MenuButton size="lg">
                    {#snippet child({ props })}
                        <a href="/" {...props}>
                            <Logo size={32} class="shrink-0 rounded-md" />
                            <span class="font-semibold">onecrab</span>
                        </a>
                    {/snippet}
                </Sidebar.MenuButton>
            </Sidebar.MenuItem>
        </Sidebar.Menu>
    </Sidebar.Header>
    <Sidebar.Content>
        <Sidebar.Group>
            <Sidebar.Menu>
                {#each main as item (item.href)}
                    <Sidebar.MenuItem>
                        <Sidebar.MenuButton isActive={isActive(item.href)} tooltipContent={item.label}>
                            {#snippet child({ props })}
                                <a href={item.href} {...props}><item.icon /><span>{item.label}</span></a>
                            {/snippet}
                        </Sidebar.MenuButton>
                    </Sidebar.MenuItem>
                {/each}
            </Sidebar.Menu>
        </Sidebar.Group>
        {#if user.role === 'superadmin'}
            <Sidebar.Group>
                <Sidebar.GroupLabel>Admin</Sidebar.GroupLabel>
                <Sidebar.Menu>
                    {#each admin as item (item.href)}
                        <Sidebar.MenuItem>
                            <Sidebar.MenuButton isActive={isActive(item.href)} tooltipContent={item.label}>
                                {#snippet child({ props })}
                                    <a href={item.href} {...props}><item.icon /><span>{item.label}</span></a>
                                {/snippet}
                            </Sidebar.MenuButton>
                        </Sidebar.MenuItem>
                    {/each}
                </Sidebar.Menu>
            </Sidebar.Group>
        {/if}
    </Sidebar.Content>
    <Sidebar.Footer>
        <Sidebar.Menu>
            <Sidebar.MenuItem>
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger>
                        {#snippet child({ props })}
                            <Sidebar.MenuButton size="lg" {...props}>
                                <Avatar userId={user.id} size={32} />
                                <div class="grid flex-1 text-left text-sm leading-tight">
                                    <span class="truncate font-medium">{user.email}</span>
                                    <span class="text-muted-foreground truncate text-xs capitalize">{user.role}</span>
                                </div>
                                <ChevronsUpDownIcon class="ml-auto size-4" />
                            </Sidebar.MenuButton>
                        {/snippet}
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content side="top" align="end" class="w-(--bits-dropdown-menu-anchor-width) min-w-56">
                        <DropdownMenu.Item onclick={logout}>
                            <LogOutIcon />
                            Log out
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>
            </Sidebar.MenuItem>
        </Sidebar.Menu>
    </Sidebar.Footer>
    <Sidebar.Rail />
</Sidebar.Root>
