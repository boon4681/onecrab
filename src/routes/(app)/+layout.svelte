<script lang="ts">
    import AppSidebar from '#lib/components/app-sidebar.svelte';
    import * as Sidebar from '#lib/components/ui/sidebar/index.js';
    import type { LayoutProps } from './$types';

    let { data, children }: LayoutProps = $props();
</script>

<Sidebar.Provider>
    <AppSidebar user={data.user} />
    <!-- min-w-0 lets wide tables scroll inside their card instead of widening the whole page. -->
    <Sidebar.Inset class="min-w-0">
        <header class="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
            <Sidebar.Trigger />
        </header>
        <div class="min-w-0 flex-1 p-4 md:p-8">
            {@render children()}
        </div>
    </Sidebar.Inset>
</Sidebar.Provider>
