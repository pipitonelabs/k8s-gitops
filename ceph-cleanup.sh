#!/bin/bash

# Exit on error
set -e

# Namespace to clean up
NAMESPACE="rook-ceph"

echo "Scaling down Rook operator..."
kubectl -n $NAMESPACE scale deployment rook-ceph-operator --replicas=0 || true
kubectl -n $NAMESPACE get pods | grep rook-ceph-operator || echo "No Rook operator pods found."

echo "Removing finalizers from HelmRelease resources in $NAMESPACE..."
for hr in $(kubectl -n $NAMESPACE get helmreleases.helm.toolkit.fluxcd.io -o name 2>/dev/null | cut -d'/' -f2); do
  echo "Patching HelmRelease $hr..."
  kubectl -n $NAMESPACE patch helmreleases.helm.toolkit.fluxcd.io $hr --type=json -p '[{"op":"replace","path":"/metadata/finalizers","value":[]}]' || true
done

echo "Deleting HelmRelease resources in $NAMESPACE..."
kubectl -n $NAMESPACE delete helmreleases.helm.toolkit.fluxcd.io --all || true

echo "Removing finalizers from Ceph resources..."
for resource in $(kubectl -n $NAMESPACE get cephcluster,cephblockpool,cephfilesystem,cephobjectstore,cephblockpoolradosnamespaces,cephclients,cephfilesystemsubvolumegroup,clientprofiles.csi.ceph.io -o name 2>/dev/null); do
  kind=$(echo $resource | cut -d'/' -f1)
  name=$(echo $resource | cut -d'/' -f2)
  echo "Patching $resource..."
  kubectl -n $NAMESPACE patch $kind $name --type=json -p '[{"op":"replace","path":"/metadata/finalizers","value":[]}]' || true
done

echo "Deleting Ceph resources..."
kubectl -n $NAMESPACE delete cephcluster --all || true
kubectl -n $NAMESPACE delete cephblockpool --all || true
kubectl -n $NAMESPACE delete cephfilesystem --all || true
kubectl -n $NAMESPACE delete cephobjectstore --all || true
kubectl -n $NAMESPACE delete cephblockpoolradosnamespaces --all || true
kubectl -n $NAMESPACE delete cephclients --all || true
kubectl -n $NAMESPACE delete cephfilesystemsubvolumegroup --all || true
kubectl -n $NAMESPACE delete clientprofiles.csi.ceph.io --all || true

echo "Removing finalizers from configmaps..."
for cm in $(kubectl -n $NAMESPACE get configmaps -o name 2>/dev/null | cut -d'/' -f2); do
  echo "Patching configmap $cm..."
  kubectl -n $NAMESPACE patch configmap $cm --type=json -p '[{"op":"replace","path":"/metadata/finalizers","value":[]}]' || true
done

echo "Deleting configmaps..."
kubectl -n $NAMESPACE delete configmaps --all || true

echo "Removing finalizers from secrets..."
for secret in $(kubectl -n $NAMESPACE get secrets -o name 2>/dev/null | cut -d'/' -f2); do
  echo "Patching secret $secret..."
  kubectl -n $NAMESPACE patch secret $secret --type=json -p '[{"op":"replace","path":"/metadata/finalizers","value":[]}]' || true
done

echo "Deleting secrets..."
kubectl -n $NAMESPACE delete secrets --all || true

echo "Removing finalizers from PVCs..."
for pvc in $(kubectl -n $NAMESPACE get pvc -o name 2>/dev/null | cut -d'/' -f2); do
  echo "Patching PVC $pvc..."
  kubectl -n $NAMESPACE patch pvc $pvc --type=json -p '[{"op":"replace","path":"/metadata/finalizers","value":[]}]' || true
done

echo "Deleting PVCs..."
kubectl -n $NAMESPACE delete pvc --all || true

echo "Removing finalizers from PVs..."
for pv in $(kubectl get pv -o name 2>/dev/null | cut -d'/' -f2); do
  echo "Patching PV $pv..."
  kubectl patch pv $pv --type=json -p '[{"op":"replace","path":"/metadata/finalizers","value":[]}]' || true
done

echo "Deleting PVs..."
kubectl delete pv --all || true

echo "Removing finalizers from pods..."
for pod in $(kubectl -n $NAMESPACE get pods -o name 2>/dev/null | cut -d'/' -f2); do
  echo "Patching pod $pod..."
  kubectl -n $NAMESPACE patch pod $pod --type=json -p '[{"op":"replace","path":"/metadata/finalizers","value":[]}]' || true
done

echo "Deleting pods..."
kubectl -n $NAMESPACE delete pods --all || true

echo "Removing finalizers from namespace $NAMESPACE..."
kubectl patch namespace $NAMESPACE --type=json -p '[{"op":"replace","path":"/metadata/finalizers","value":[]}]' || true

echo "Removing finalizers from Rook CRDs..."
for crd in $(kubectl get crd -o name 2>/dev/null | grep rook | cut -d'/' -f2); do
  echo "Patching CRD $crd..."
  kubectl patch crd $crd --type=json -p '[{"op":"replace","path":"/metadata/finalizers","value":[]}]' || true
  kubectl delete crd $crd || true
done

echo "Cleaning up Rook cluster roles and bindings..."
kubectl delete clusterrole rook-ceph-cluster-mgmt rook-ceph-global rook-ceph-mgr-cluster rook-ceph-mgr-system rook-ceph-object-store rook-ceph-osd rook-ceph-system || true
kubectl delete clusterrolebinding rook-ceph-cluster-mgmt rook-ceph-global rook-ceph-mgr-cluster rook-ceph-mgr-system rook-ceph-object-store rook-ceph-osd rook-ceph-system || true

echo "Checking for HelmRelease resources in other namespaces (e.g., flux-system)..."
for ns in $(kubectl get namespaces -o name | cut -d'/' -f2 | grep -E 'flux-system|default'); do
  for hr in $(kubectl -n $ns get helmreleases.helm.toolkit.fluxcd.io -o name 2>/dev/null | grep rook | cut -d'/' -f2); do
    echo "Patching HelmRelease $hr in namespace $ns..."
    kubectl -n $ns patch helmreleases.helm.toolkit.fluxcd.io $hr --type=json -p '[{"op":"replace","path":"/metadata/finalizers","value":[]}]' || true
    kubectl -n $ns delete helmreleases.helm.toolkit.fluxcd.io $hr || true
  done
done

echo "Deleting namespace $NAMESPACE..."
kubectl delete namespace $NAMESPACE --force --grace-period=0 || true

echo "Verifying cleanup..."
kubectl get namespaces | grep $NAMESPACE || echo "Namespace $NAMESPACE deleted."
kubectl get all --all-namespaces | grep rook || echo "No Rook resources found."
kubectl get pv | grep rook || echo "No Rook PVs found."
kubectl get crd | grep rook || echo "No Rook CRDs found."
kubectl get helmreleases.helm.toolkit.fluxcd.io --all-namespaces | grep rook || echo "No Rook HelmReleases found."

echo "Cleanup complete."