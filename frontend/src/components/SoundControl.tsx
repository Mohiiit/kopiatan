import { createSignal, onMount, Show } from "solid-js";
import type { Component } from "solid-js";
import { SoundManager } from "../utils/SoundManager";

export const SoundControl: Component = () => {
  const [volume, setVolume] = createSignal(SoundManager.volume);
  const [muted, setMuted] = createSignal(SoundManager.muted);
  const [showSlider, setShowSlider] = createSignal(false);

  onMount(() => {
    // Set up callbacks to sync UI with SoundManager state
    SoundManager.setCallbacks(
      (vol) => setVolume(vol),
      (m) => setMuted(m)
    );
  });

  const handleMuteToggle = () => {
    SoundManager.toggleMute();
  };

  const handleVolumeChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    SoundManager.volume = parseFloat(target.value);
  };

  const getVolumeIcon = () => {
    if (muted() || volume() === 0) return "🔇";
    if (volume() < 0.3) return "🔈";
    if (volume() < 0.7) return "🔉";
    return "🔊";
  };

  return (
    <div
      class="sound-control"
      onMouseEnter={() => setShowSlider(true)}
      onMouseLeave={() => setShowSlider(false)}
    >
      <button
        class="sound-toggle"
        onClick={handleMuteToggle}
        title={muted() ? "Unmute" : "Mute"}
      >
        {getVolumeIcon()}
      </button>

      <Show when={showSlider()}>
        <div class="volume-slider-container">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume()}
            onInput={handleVolumeChange}
            class="volume-slider"
          />
          <span class="volume-percentage">{Math.round(volume() * 100)}%</span>
        </div>
      </Show>
    </div>
  );
};

export default SoundControl;
