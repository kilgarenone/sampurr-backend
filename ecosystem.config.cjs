module.exports = {
  apps: [
    {
      name: "sampurr",
      script: "./server.js",
      instances: "max", // detect the number of available CPUs and run as many processes as possible
      exec_mode: "cluster", // so PM2 know you want to load balance between each instances
      max_memory_restart: "500M", // prevent memory leaks(?)
      merge_logs: true, // all instances of a clustered process logs into the same file when in cluster mode
      time: true, // prefix timestamp to log
      log_date_format: "YYYY-MM-DD HH:mm Z", // format of the logs' timestamp
    },
  ],
}
