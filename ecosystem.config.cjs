/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: 'mcp-doc',
      script: 'dist/index.js',
      cwd: '/home/ec2-user/mcp-doc',   // ← đổi thành EC2_APP_DIR của bạn

      // Node.js flags
      node_args: [],

      // Restart policy
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',

      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: false,

      // Logs
      out_file: '/var/log/mcp-doc/out.log',
      error_file: '/var/log/mcp-doc/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Environment (production — secrets via .env trên EC2)
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
