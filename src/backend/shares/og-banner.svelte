<script lang="ts">
    type Props = {
        logo: string;
        lock: string;
        avatar: string | null;
        size: string;
        expires: string;
        downloads: string;
    };
    let { logo, lock, avatar, size, expires, downloads }: Props = $props();

    const line = "#262626";
    const red = "#F43838";
    const mono = "font-family: JetBrains Mono";
    const label = `${mono}; font-size: 14px; font-weight: 700; letter-spacing: 2px; color: #737373`;
    const value = `${mono}; font-size: 26px; font-weight: 700`;
    const right = `width: 340px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-left: 2px solid`;
    const left = `display: flex; flex-direction: column; justify-content: center; flex-grow: 1; padding: 0 40px`;
</script>

<div style="width: 1132px; height: 562px; display: flex; padding: 34px; background-color: #0a0a0a; font-family: Figtree; color: #fafafa">
    <div
        style="display: flex; flex-direction: column; flex-grow: 1; overflow: hidden; background-color: #121212; border: 2px solid {line}; border-radius: 10px"
    >
        <div style="display: flex; height: 96px; border-bottom: 2px solid {line}">
            <div style="{left}; flex-direction: row; align-items: center; justify-content: flex-start; gap: 14px">
                <img src={logo} width="48" height="48" alt="" style="border-radius: 11px" />
                <div style="font-size: 30px; font-weight: 700; letter-spacing: -0.8px">onecrab</div>
            </div>
            <div style="{right} {red}; flex-direction: row; gap: 12px; background-color: {red}; color: #0a0a0a">
                <img src={lock} width="22" height="22" alt="" />
                <div style="{mono}; font-size: 18px; font-weight: 800; letter-spacing: 2px">PASSCODE REQUIRED</div>
            </div>
        </div>

        <div style="display: flex; flex-grow: 1; border-bottom: 2px solid {line}">
            <div style="{left}; gap: 4px">
                <div style={label}>SIZE</div>
                <div style="{mono}; font-size: 132px; font-weight: 800; letter-spacing: -6px; line-height: 1">{size}</div>
            </div>
            <div style="{right} {line}; gap: 18px">
                <div style={label}>FROM</div>
                {#if avatar}
                    <img src={avatar} width="140" height="140" alt="" style="border-radius: 999px" />
                {:else}
                    <div style="width: 140px; height: 140px; border-radius: 999px; background-color: #262626"></div>
                {/if}
            </div>
        </div>

        <div style="display: flex; height: 118px">
            <div style="{left}; gap: 8px">
                <div style={label}>EXPIRES</div>
                <div style={value}>{expires}</div>
            </div>
            <div style="{right} {line}; gap: 8px">
                <div style={label}>DOWNLOADS</div>
                <div style={value}>{downloads}</div>
            </div>
        </div>
    </div>
</div>
