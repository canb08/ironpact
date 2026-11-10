/** Do not reset the native file selection while async card creation or image
 * decoding is still consuming it. Reset after success or failure for retries.
 */
export async function consumeSelectedPhoto(
  input: HTMLInputElement,
  consume: (file: File) => Promise<void>,
): Promise<void> {
  const file = input.files?.[0];
  if (!file) return;
  try { await consume(file); }
  finally { input.value = ''; }
}
