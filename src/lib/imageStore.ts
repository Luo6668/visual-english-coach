let pendingUri: string | null = null;

export const setPendingUri = (uri: string) => {
  pendingUri = uri;
};

export const consumePendingUri = () => {
  const uri = pendingUri;
  pendingUri = null;
  return uri;
};