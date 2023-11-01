const { exec } = require('child_process');

// Get socketName from environment variable
const socketName = process.env.SOCKET_NAME;

// Function to check if border0 process is running
const checkProcess = () => {
  exec('pgrep border0', (error, stdout, stderr) => {
    if (error) {
      // border0 process is not running, perform cleanup
      exec(`./border0 socket delete ${socketName}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          return;
        }
        console.log('Cleanup completed');
        process.exit(0);
      });
    } else {
      // border0 process is still running, check again in 5 seconds
      setTimeout(checkProcess, 5000);
    }
  });
};

// Start checking the border0 process
checkProcess();
