declare module "virtual:figuro-fonts" {
  const assetPath: string;
  export default assetPath;
}

interface Window {
  EXCALIDRAW_ASSET_PATH?: string | string[];
}
