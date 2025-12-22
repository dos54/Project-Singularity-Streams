If your test server is on a different machine than your client, you might need change firewall rules to allow access to port 4100. If you're running UFW on linux
```bash
sudo ufw allow 4100/tcp
```