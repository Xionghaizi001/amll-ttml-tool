/** Host-owned origin metadata, kept outside the plugin's manifest. */
export interface StoreInstallationProvenance {
	providerId: string;
	providerName: string;
	/** Digest of the downloaded container, distinct from executable content. */
	artifactSha256: string;
}
