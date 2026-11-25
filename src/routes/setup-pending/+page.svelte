<script lang="ts">
    import Logo from '#lib/components/logo.svelte';
</script>

<svelte:head>
    <title>Setup pending · onecrab</title>
</svelte:head>

<main class="flex min-h-svh items-center justify-center p-6">
    <div class="flex max-w-md flex-col items-center space-y-2 text-center">
        <Logo size={64} />
        <h1 class="text-2xl font-semibold">Setup pending</h1>
        <p class="text-muted-foreground">
            onecrab has no superadmin yet. Open the setup link printed in the server log to finish setup.
        </p>
    </div>
</main>
