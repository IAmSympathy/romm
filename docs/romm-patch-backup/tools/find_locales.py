import glob, os

for root, dirs, files in os.walk('/var/www/html'):
    for file in files:
        if 'fr' in file.lower() or 'locale' in file.lower() or 'lang' in file.lower() or file.endswith('.json'):
            print(os.path.join(root, file))
