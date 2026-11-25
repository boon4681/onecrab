<script lang="ts">
    import logo from '#lib/assets/logo.svg';

    let { size = 32, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<img src={logo} alt="onecrab" width={size} height={size} class={className} />
