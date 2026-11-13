/** An Upload's id: "upload-" and a UUID. Its Summary is private to its owner. */
export function isUploadId(id: string): boolean {
  return /^upload-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}
