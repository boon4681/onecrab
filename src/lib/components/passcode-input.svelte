<script lang="ts">
    import { cn } from '#lib/utils.js';

    type Props = {
        value?: string;
        id?: string;
        readonly?: boolean;
        autofocus?: boolean;
        invalid?: boolean;
        minSlots?: number;
        maxLength?: number;
        size?: 'md' | 'sm';
        class?: string;
    };

    let {
        value = $bindable(''),
        id,
        readonly = false,
        autofocus = false,
        invalid = false,
        minSlots = 6,
        maxLength = 64,
        size = 'md',
        class: className
    }: Props = $props();

    let focused = $state(false);

    // An extra empty slot once the minimum is filled hints that longer custom passcodes are fine,
    // without the slot count ever revealing a passcode's real length.
    const slotCount = $derived(
        Math.min(maxLength, Math.max(minSlots, value.length + (focused && !readonly && value.length >= minSlots ? 1 : 0)))
    );
    const active = $derived(Math.min(value.length, slotCount - 1));
    const grouped = $derived(slotCount === 6);

    const clean = (raw: string) =>
        raw
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, maxLength);

    const oninput = (e: Event) => {
        const input = e.currentTarget as HTMLInputElement;
        value = clean(input.value);
        input.value = value;
    };
</script>

<div class={cn('relative w-fit', className)}>
    <div class="flex flex-wrap items-center gap-2" aria-hidden="true">
        {#each { length: slotCount }, i (i)}
            {#if grouped && i === 3}
                <span class="bg-muted-foreground/40 h-1 w-3 rounded-full"></span>
            {/if}
            {@const isActive = focused && !readonly && i === active}
            <div
                class={cn(
                    'bg-input/30 relative flex items-center justify-center rounded-xl border font-mono font-semibold transition-all duration-150',
                    size === 'sm' ? 'h-11 w-9 text-lg' : 'h-14 w-11 text-2xl',
                    value[i] ? 'border-foreground/25 text-foreground' : 'text-muted-foreground',
                    isActive && 'border-primary ring-primary/30 scale-105 ring-4',
                    invalid && 'border-destructive/70 animate-[shake_0.3s_ease-in-out]'
                )}
            >
                {value[i] ?? ''}
                {#if isActive && !value[i]}
                    <span class="bg-foreground absolute h-6 w-0.5 animate-pulse rounded-full"></span>
                {/if}
            </div>
        {/each}
    </div>
    {#if readonly}
        <input {id} class="sr-only" readonly {value} />
    {:else}
        <!-- svelte-ignore a11y_autofocus -->
        <input
            {id}
            {value}
            {autofocus}
            {oninput}
            onfocus={() => (focused = true)}
            onblur={() => (focused = false)}
            class="absolute inset-0 h-full w-full cursor-text opacity-0"
            autocomplete="one-time-code"
            autocapitalize="characters"
            spellcheck="false"
            inputmode="text"
            maxlength={maxLength}
            aria-invalid={invalid}
        />
    {/if}
</div>

<style>
    @keyframes -global-shake {
        0%,
        100% {
            transform: translateX(0);
        }
        25% {
            transform: translateX(-4px);
        }
        75% {
            transform: translateX(4px);
        }
    }
</style>
