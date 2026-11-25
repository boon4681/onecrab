<script lang="ts">
    let { userId, size = 32 }: { userId: string; size?: number } = $props();
</script>

<img src="/api/avatar/{userId}" alt="" width={size} height={size} class="rounded-full" />
