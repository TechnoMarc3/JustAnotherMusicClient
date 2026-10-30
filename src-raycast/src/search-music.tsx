import { List, ActionPanel, Action, showHUD, showToast, Toast, Icon } from "@raycast/api";
import { useState, useEffect, useRef } from "react";

export interface Track {
  id: string;
  title: string;
  artist?: string;
  artists?: { name: string }[];
  artworkUrl?: string;
  durationSec?: number;
}

const JAMC_API = "http://127.0.0.1:18420";

export default function SearchCommand() {
  const [searchText, setSearchText] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    setIsLoading(true);

    debounceTimer.current = setTimeout(async () => {
      try {
        const query = searchText.trim();
        const url = query
          ? `${JAMC_API}/api/search?q=${encodeURIComponent(query)}`
          : `${JAMC_API}/api/recommendations`;

        const response = await fetch(url);
        if (response.ok) {
          const data = (await response.json()) as Track[];
          setTracks(data);
        } else {
          setTracks([]);
        }
      } catch (error) {
        setTracks([]);
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms throttle

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchText]);

  const handlePlayTrack = async (track: Track) => {
    try {
      const response = await fetch(`${JAMC_API}/api/play-track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      });

      if (response.ok) {
        await showHUD(`▶ ${track.title}`);
      } else {
        await showToast({ style: Toast.Style.Failure, title: "Wiedergabe fehlgeschlagen" });
      }
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "JAMC not available",
        message: "Is the app running in the background?",
      });
    }
  };

  return (
    <List
      searchBarPlaceholder="Search for songs, artists, or albums..."
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      throttle
    >
      <List.Section title={searchText ? "Search results" : "Recommended tracks"} subtitle={`${tracks.length} tracks`}>
        {tracks.map((track) => {
          const artistName =
            track.artist || track.artists?.map((a) => a.name).join(", ") || "Unknown artist";

          return (
            <List.Item
              key={track.id}
              icon={track.artworkUrl ? { source: track.artworkUrl } : Icon.Music}
              title={track.title}
              subtitle={artistName}
              actions={
                <ActionPanel>
                  <Action
                    title="Play Track"
                    icon={Icon.Play}
                    onAction={() => handlePlayTrack(track)}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}