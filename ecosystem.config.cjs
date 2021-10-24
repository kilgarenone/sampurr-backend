module.exports = {
  apps: [
    {
      name: "sampurr",
      script: "./server.js",
      instances: 0,
      exec_mode: "cluster",
      max_memory_restart: "170M",
      merge_logs: true, // all instances of a clustered process logs into the same file when in cluster mode
      time: true, // prefix timestamp to log
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
  ],
};
