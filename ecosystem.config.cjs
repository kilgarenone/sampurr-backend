module.exports = {
  apps: [
    {
      name: "sampurr",
      script: "./server.js",
      exec_mode: "cluster",
      max_memory_restart: "170M",
      merge_logs: true, // all instances of a clustered process logs into the same file when in cluster mode
    },
  ],
};
