/**
 * Copy text to clipboard
 * @returns true if successful, false otherwise
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    console.error('Failed to copy text:', err)
    return false
  }
}
