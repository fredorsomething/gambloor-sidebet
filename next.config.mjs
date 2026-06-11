/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/bets/:id/opengraph-image",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=300",
          },
        ],
      },
      {
        source: "/markets/:id/opengraph-image",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, s-maxage=300",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/portfolio",
        destination: "/me",
        permanent: true,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // pino-pretty and friends are server-side-only deps that some wallet
    // libraries try to `require` even when bundled for the browser.
    config.externals.push("pino-pretty", "lokijs", "encoding");

    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /ox\/_esm\/tempo\/internal\/virtualMasterPool/,
        message: /Critical dependency/,
      },
    ];

    // @react-native-async-storage/async-storage is an optional peer dep of
    // WalletConnect / MetaMask SDK used only in React Native. Alias it to
    // `false` so webpack ignores the require entirely on web builds.
    //
    // `ws` is an optional Node dependency of viem's WebSocket transport (pulled
    // in transitively via @privy-io/wagmi -> @wagmi/connectors -> Safe SDK).
    // Sidebet only uses the HTTP transport, so alias it to `false` to skip the
    // unresolved require in both client and server bundles.
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@react-native-async-storage/async-storage": false,
      ws: false,
      // Optional Solana/Farcaster integrations referenced by Privy but unused
      // here (Sidebet is EVM-only). Skip the unresolved imports.
      "@farcaster/mini-app-solana": false,
    };
    return config;
  },
};

export default nextConfig;
