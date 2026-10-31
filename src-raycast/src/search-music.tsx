import { List, ActionPanel, Action, Icon, Toast, showToast, showHUD } from "@raycast/api";
import { useState, useEffect, useRef } from "react";
import { Playlist, SearchResults, Track } from "../../src/datasource/types";

const JAMC_API = "http://127.0.0.1:18420";
type Tab = "search" | "queue";

export default function CombinedCommand() {
  const [activeTab, setActiveTab] = useState<Tab>("search");

  // Search States
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults>();
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);


  const [queueTracks, setQueueTracks] = useState<Track[]>([]);
  const [isQueueLoading, setIsQueueLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== "search") return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    setIsSearchLoading(true);

    debounceTimer.current = setTimeout(async () => {
      try {
        const query = searchText.trim();
        const url = query
          ? `${JAMC_API}/api/search?q=${encodeURIComponent(query)}`
          : `${JAMC_API}/api/recommendations`;

        const response = await fetch(url);
        if (response.ok) {
          const data = (await response.json()) as SearchResults;
          setSearchResults(data);
        } else {
          setSearchResults({ tracks: [], albums: [], artists: [], playlists: [] });
        }
      } catch {
        setSearchResults({ tracks: [], albums: [], artists: [], playlists: [] });
      } finally {
        setIsSearchLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchText, activeTab]);

  const fetchQueue = async () => {
    setIsQueueLoading(true);
    try {
      const response = await fetch(`${JAMC_API}/api/playlist`);
      if (response.ok) {
        const data = (await response.json()) as { queue: Track[] };
        setQueueTracks(data.queue || []);
      }
    } catch (error) {
      console.error("Error fetching playlist:", error);
    } finally {
      setIsQueueLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "queue") {
      fetchQueue();
    }
  }, [activeTab]);

  const toggleTab = () => {
    setActiveTab((prev) => (prev === "search" ? "queue" : "search"));
  };

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
    } catch {
      await showToast({
        style: Toast.Style.Failure,
        title: "JAMC nicht erreichbar",
        message: "Läuft die App im Hintergrund?",
      });
    }
  };

  const handlePlayPlaylist = async (playlist: Playlist) => {
    try {
      const response = await fetch(`${JAMC_API}/api/play-playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(playlist),
      });

      if (response.ok) {
        await showHUD(`▶ ${playlist.title}`);
      } else {
        await showToast({ style: Toast.Style.Failure, title: "Wiedergabe fehlgeschlagen" });
      }
    } catch {
      await showToast({
        style: Toast.Style.Failure,
        title: "JAMC nicht erreichbar",
        message: "Läuft die App im Hintergrund?",
      });
    }
  };

  const moveTrack = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= queueTracks.length) return;

    const updated = [...queueTracks];
    const [movedTrack] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, movedTrack);

    setQueueTracks(updated);

    try {
      const response = await fetch(`${JAMC_API}/api/playlist/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromIndex: index, toIndex: targetIndex }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      await showToast({
        style: Toast.Style.Success,
        title: `"${movedTrack.title}" verschoben`,
        message: `Position ${targetIndex + 1} von ${queueTracks.length}`,
      });
    } catch (error) {
      console.error("Error reordering playlist:", error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Fehler beim Verschieben",
        message: "Die Änderungen konnten nicht gespeichert werden.",
      });
      fetchQueue(); 
    }
  };

  const SwitchTabAction = () => (
    <Action
      title={activeTab === "search" ? "Zur Warteschlange Wechseln" : "Zur Suche Wechseln"}
      icon={activeTab === "search" ? Icon.List : Icon.MagnifyingGlass}
      shortcut={{ modifiers: [], key: "tab" }}
      onAction={toggleTab}
    />
  );

  const filteredQueue = queueTracks.filter(
    (t) =>
      t.title.toLowerCase().includes(searchText.toLowerCase()) ||
      t.artist?.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <List
      searchBarPlaceholder={
        activeTab === "search"
          ? "🔍 Search for songs, artists, or albums... (Tab for queue)"
          : "📜 Search the queue... (Tab for search)"
      }
      isLoading={activeTab === "search" ? isSearchLoading : isQueueLoading}
      onSearchTextChange={setSearchText}
      throttle
      searchBarAccessory={
        <List.Dropdown
          tooltip="Ansicht wechseln"
          value={activeTab}
          onChange={(newValue) => {setActiveTab(newValue as Tab); setSearchText("")}}
        >
          <List.Dropdown.Item title="Search" value="search" icon={Icon.MagnifyingGlass} />
          <List.Dropdown.Item title="Queue" value="queue" icon={Icon.List} />
        </List.Dropdown>
      }
    >
      {!isSearchLoading && (
      <List.EmptyView
        icon={activeTab === "search" ? Icon.MagnifyingGlass : Icon.List}
        title={activeTab === "search" ? "No results found" : "Queue is empty"}
        actions={
          <ActionPanel>
            <Action
              title={activeTab === "search" ? "Go to Queue" : "Go to Search"}
              icon={activeTab === "search" ? Icon.List : Icon.MagnifyingGlass}
              shortcut={{ modifiers: [], key: "tab" }}
              onAction={toggleTab}
            />
          </ActionPanel>
        }
      />
    )}
  
      {activeTab === "search" ? (
        <>
          {searchResults?.playlists && searchResults.playlists.length > 0 && (
            <List.Section title={searchText ? "Playlists" : "Empfohlene Playlists"}>
              {searchResults.playlists.map((playlist) => (
                <List.Item
                  key={playlist.id}
                  icon={playlist.artworkUrl ? { source: playlist.artworkUrl } : Icon.Music}
                  title={playlist.title}
                  actions={
                    <ActionPanel>
                      <Action
                        title="Start Playlist"
                        icon={Icon.Play}
                        onAction={() => handlePlayPlaylist(playlist)}
                      />
                      <SwitchTabAction />
                    </ActionPanel>
                  }
                />
              ))}
            </List.Section>
          )}

          <List.Section title={searchText ? "Search Results" : "Recommendations"}>
            {searchResults?.tracks?.map((track) => {
              const artistName =
                track.artist || track.artists?.map((a) => a.name).join(", ") || "Unknown Artist";

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
                      <SwitchTabAction />
                      <Action
                        title="Add to Queue"
                        icon={Icon.Plus}
                        onAction={() => // handleAddToQueue(track)
                          {}
                        }
                      />
                      <Action
                        title="Add to Queue and Play Next"
                        icon={Icon.Plus}
                        onAction={() => // handleAddToQueue(track)
                          {}
                        }
                      />
                    </ActionPanel>
                  }
                />
              );
            })}
          </List.Section>
        </>
      ) : (
        <List.Section title={`Queue (${filteredQueue.length} Songs)`}>
          {filteredQueue.map((track, _) => {
            const index = queueTracks.findIndex((t) => t.id === track.id);
            const isFirst = index === 0;
            const isLast = index === filteredQueue.length - 1;

            return (
              <List.Item
                key={track.id}
                icon={track.artworkUrl ? { source: track.artworkUrl } : Icon.Music}
                title={`${index + 1}. ${track.title}`}
                subtitle={track.artist}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section title="Playback">
                      <Action
                        title="Go to Track"
                        icon={Icon.Forward}
                        onAction={() => handlePlayTrack(track)}
                      />
                    </ActionPanel.Section>

                    <ActionPanel.Section title="Change Position">
                      {!isFirst && (
                        <Action
                          title="Move Up"
                          icon={Icon.ArrowLeft}
                          shortcut={{ modifiers: [], key: "arrowLeft" }}
                          onAction={() => moveTrack(index, "up")}
                        />
                      )}
                      {!isLast && (
                        <Action
                          title="Move Down"
                          icon={Icon.ArrowRight}
                          shortcut={{ modifiers: [], key: "arrowRight" }}
                          onAction={() => moveTrack(index, "down")}
                        />
                      )}
                    </ActionPanel.Section>

                    <ActionPanel.Section>
                      <SwitchTabAction />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}