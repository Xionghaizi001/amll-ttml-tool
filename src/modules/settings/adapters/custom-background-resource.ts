import { ManagedResource } from "$/kernel/platform";
import { BrowserObjectUrlResource } from "$/platform/resources/BrowserObjectUrlResource";
import { IndexedDbCustomBackgroundStorage } from "$/platform/storage/IndexedDbCustomBackgroundStorage";

export const customBackgroundResource = new ManagedResource(
	new IndexedDbCustomBackgroundStorage(),
	new BrowserObjectUrlResource(),
);
