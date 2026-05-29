/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // pino-pretty and friends are server-side-only deps that some wallet
    // libraries try to `require` even when bundled for the browser.
    config.externals.push("pino-pretty", "lokijs", "encoding");

    // @react-native-async-storage/async-storage is an optional peer dep of
    // WalletConnect / MetaMask SDK used only in React Native. Alias it to
    // `false` so webpack ignores the require entirely on web builds.
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
