import { showHUD } from "@raycast/api";

export default async function Command() {
  try {
    const response = await fetch("http://127.0.0.1:18420/api/previous", {
      method: "POST",
    });

    if (!response.ok) {
      await showHUD(`Error: HTTP ${response.status}`);
      return; 
    }

    await showHUD("Previous track");
  } catch (error) {
    await showHUD("JAMC not available");
  }
}